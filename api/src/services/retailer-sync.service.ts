import { SupabaseClient } from '@supabase/supabase-js';
import { IntegrationService } from './integration.service.js';

export interface RetailerData {
  external_customer_id?: string;
  name: string;
  email: string;
  phone?: string;
  billing_address?: string;
  billing_city?: string;
  billing_state?: string;
  billing_postal_code?: string;
  billing_country?: string;
  tax_id?: string;
  is_active?: boolean;
}

export interface LocationData {
  location_name: string;
  contact_person?: string;
  contact_phone?: string;
  address: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  is_default?: boolean;
  delivery_notes?: string;
}

export class RetailerSyncService {
  constructor(
    private supabase: SupabaseClient,
    private integrationService: IntegrationService
  ) {}

  async syncRetailerFromKubacco(
    integrationId: string,
    kubaccoRetailerData: any
  ): Promise<{ customerId: string; isNew: boolean }> {
    try {
      const retailerData: RetailerData = {
        external_customer_id: kubaccoRetailerData.id?.toString(),
        name: kubaccoRetailerData.name || kubaccoRetailerData.business_name,
        email: kubaccoRetailerData.email,
        phone: kubaccoRetailerData.phone,
        billing_address: kubaccoRetailerData.billing?.address_1,
        billing_city: kubaccoRetailerData.billing?.city,
        billing_state: kubaccoRetailerData.billing?.state,
        billing_postal_code: kubaccoRetailerData.billing?.postcode,
        billing_country: kubaccoRetailerData.billing?.country || 'US',
        tax_id: kubaccoRetailerData.tax_id,
        is_active: true
      };

      const { data: existingCustomer } = await this.supabase
        .from('ops_customers')
        .select('id, email')
        .eq('email', retailerData.email)
        .maybeSingle();

      let customerId: string;
      let isNew = false;

      if (existingCustomer) {
        const { data: updated, error: updateError } = await this.supabase
          .from('ops_customers')
          .update(retailerData)
          .eq('id', existingCustomer.id)
          .select()
          .single();

        if (updateError) throw updateError;
        customerId = updated.id;
      } else {
        const { data: created, error: createError } = await this.supabase
          .from('ops_customers')
          .insert(retailerData)
          .select()
          .single();

        if (createError) throw createError;
        customerId = created.id;
        isNew = true;
      }

      return { customerId, isNew };
    } catch (error) {
      console.error('Error syncing retailer:', error);
      throw error;
    }
  }

  async syncLocationForCustomer(
    customerId: string,
    locationData: LocationData
  ): Promise<string> {
    try {
      const { data: existingLocation } = await this.supabase
        .from('customer_locations')
        .select('id')
        .eq('customer_id', customerId)
        .eq('address', locationData.address)
        .eq('city', locationData.city)
        .eq('state', locationData.state)
        .maybeSingle();

      if (existingLocation) {
        const { data: updated, error: updateError } = await this.supabase
          .from('customer_locations')
          .update({
            ...locationData,
            is_active: true
          })
          .eq('id', existingLocation.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated.id;
      } else {
        const { data: existingLocations } = await this.supabase
          .from('customer_locations')
          .select('id')
          .eq('customer_id', customerId);

        const isFirstLocation = !existingLocations || existingLocations.length === 0;

        const { data: created, error: createError } = await this.supabase
          .from('customer_locations')
          .insert({
            customer_id: customerId,
            ...locationData,
            is_default: locationData.is_default !== undefined ? locationData.is_default : isFirstLocation,
            is_active: true
          })
          .select()
          .single();

        if (createError) throw createError;
        return created.id;
      }
    } catch (error) {
      console.error('Error syncing location:', error);
      throw error;
    }
  }

  async syncOrderWithLocation(
    integrationId: string,
    kubaccoOrderData: any
  ): Promise<{ orderId: string; customerId: string; locationId: string }> {
    try {
      const { customerId } = await this.syncRetailerFromKubacco(
        integrationId,
        {
          id: kubaccoOrderData.customer?.id || kubaccoOrderData.customer_id,
          name: kubaccoOrderData.shipping?.company || kubaccoOrderData.billing?.company || kubaccoOrderData.customer?.name,
          email: kubaccoOrderData.billing?.email || kubaccoOrderData.customer?.email,
          phone: kubaccoOrderData.billing?.phone || kubaccoOrderData.customer?.phone,
          billing: kubaccoOrderData.billing
        }
      );

      const shipping = kubaccoOrderData.shipping || {};
      const locationName = shipping.company ||
                          `${shipping.city || ''} Location`.trim() ||
                          'Main Location';

      const locationData: LocationData = {
        location_name: locationName,
        contact_person: shipping.first_name && shipping.last_name
          ? `${shipping.first_name} ${shipping.last_name}`.trim()
          : kubaccoOrderData.billing?.first_name && kubaccoOrderData.billing?.last_name
            ? `${kubaccoOrderData.billing.first_name} ${kubaccoOrderData.billing.last_name}`.trim()
            : undefined,
        contact_phone: shipping.phone || kubaccoOrderData.billing?.phone,
        address: shipping.address_1 || '',
        address_line2: shipping.address_2,
        city: shipping.city || '',
        state: shipping.state || '',
        postal_code: shipping.postcode || '',
        country: shipping.country || 'US'
      };

      const locationId = await this.syncLocationForCustomer(customerId, locationData);

      const orderData = {
        external_order_id: kubaccoOrderData.id?.toString() || kubaccoOrderData.order_number,
        integration_id: integrationId,
        customer_id: customerId,
        shipping_location_id: locationId,
        order_code: kubaccoOrderData.order_number || kubaccoOrderData.number || `ORD-${kubaccoOrderData.id}`,
        channel: 'WHOLESALE' as const,
        status: this.mapOrderStatus(kubaccoOrderData.status),
        receiver: locationData.contact_person || locationName,
        address: locationData.address,
        address_line2: locationData.address_line2,
        city: locationData.city,
        state: locationData.state,
        postal_code: locationData.postal_code,
        country: locationData.country,
        email: kubaccoOrderData.billing?.email || kubaccoOrderData.customer?.email,
        phone: locationData.contact_phone,
        order_total: parseFloat(kubaccoOrderData.total || '0'),
        order_date: kubaccoOrderData.date_created ? new Date(kubaccoOrderData.date_created) : new Date()
      };

      const { data: existingOrder } = await this.supabase
        .from('ops_orders')
        .select('id')
        .eq('external_order_id', orderData.external_order_id)
        .eq('integration_id', integrationId)
        .maybeSingle();

      let orderId: string;

      if (existingOrder) {
        const { data: updated, error: updateError } = await this.supabase
          .from('ops_orders')
          .update(orderData)
          .eq('id', existingOrder.id)
          .select()
          .single();

        if (updateError) throw updateError;
        orderId = updated.id;
      } else {
        const { data: created, error: createError } = await this.supabase
          .from('ops_orders')
          .insert(orderData)
          .select()
          .single();

        if (createError) throw createError;
        orderId = created.id;

        if (kubaccoOrderData.line_items && Array.isArray(kubaccoOrderData.line_items)) {
          const orderItems = kubaccoOrderData.line_items.map((item: any) => ({
            order_id: orderId,
            external_product_id: item.product_id?.toString(),
            external_variation_id: item.variation_id?.toString(),
            sku: item.sku,
            item_name: item.name,
            quantity: item.quantity,
            unit_price: parseFloat(item.price || '0'),
            total_price: parseFloat(item.total || '0')
          }));

          const { error: itemsError } = await this.supabase
            .from('ops_order_items')
            .insert(orderItems);

          if (itemsError) {
            console.error('Failed to create order items:', itemsError);
          }
        }
      }

      return { orderId, customerId, locationId };
    } catch (error) {
      console.error('Error syncing order with location:', error);
      throw error;
    }
  }

  async getAllRetailers(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('ops_customers')
        .select(`
          *,
          customer_locations(*)
        `)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching retailers:', error);
      throw error;
    }
  }

  async getRetailerById(customerId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('ops_customers')
        .select(`
          *,
          customer_locations(*)
        `)
        .eq('id', customerId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching retailer:', error);
      throw error;
    }
  }

  async getLocationsByCustomer(customerId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('customer_locations')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('location_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching locations:', error);
      throw error;
    }
  }

  async setDefaultLocation(locationId: string): Promise<void> {
    try {
      const { data: location, error: locationError } = await this.supabase
        .from('customer_locations')
        .select('customer_id')
        .eq('id', locationId)
        .single();

      if (locationError) throw locationError;

      await this.supabase
        .from('customer_locations')
        .update({ is_default: false })
        .eq('customer_id', location.customer_id);

      const { error: updateError } = await this.supabase
        .from('customer_locations')
        .update({ is_default: true })
        .eq('id', locationId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error setting default location:', error);
      throw error;
    }
  }

  private mapOrderStatus(kubaccoStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PROCESSING',
      'processing': 'PROCESSING',
      'on-hold': 'PROCESSING',
      'completed': 'DELIVERED',
      'cancelled': 'CANCELLED',
      'refunded': 'RETURNED',
      'failed': 'CANCELLED'
    };

    return statusMap[kubaccoStatus?.toLowerCase()] || 'PROCESSING';
  }
}
