import { SupabaseClient } from '@supabase/supabase-js';
import { WooCommerceClient, WooCommerceOrder } from './woocommerce-client.js';
import { IntegrationService } from './integration.service.js';

export interface ImportOrderResult {
  success: boolean;
  orderId?: string;
  externalOrderId: number;
  error?: string;
}

export class OrderImportService {
  constructor(
    private supabase: SupabaseClient,
    private integrationService: IntegrationService
  ) {}

  private mapWooCommerceStatusToWarehouse(wooStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PROCESSING',
      'processing': 'PROCESSING',
      'on-hold': 'PROCESSING',
      'completed': 'DELIVERED',
      'cancelled': 'CANCELLED',
      'refunded': 'RETURNED',
      'failed': 'CANCELLED'
    };

    return statusMap[wooStatus] || 'PROCESSING';
  }

  private async orderExists(externalOrderId: number, integrationId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('ops_orders')
      .select('id')
      .eq('external_order_id', externalOrderId)
      .eq('integration_id', integrationId)
      .maybeSingle();

    if (error) {
      console.error('Error checking order existence:', error);
      return false;
    }

    return !!data;
  }

  async importOrder(
    wooOrder: WooCommerceOrder,
    integrationId: string
  ): Promise<ImportOrderResult> {
    try {
      const exists = await this.orderExists(wooOrder.id, integrationId);
      if (exists) {
        return {
          success: false,
          externalOrderId: wooOrder.id,
          error: 'Order already imported'
        };
      }

      const shippingAddress = wooOrder.shipping;
      const billingAddress = wooOrder.billing;
      const useShipping = shippingAddress.address_1 && shippingAddress.city;

      const orderData = {
        order_code: wooOrder.order_key || `WOO-${wooOrder.id}`,
        channel: 'ONLINE' as const,
        status: this.mapWooCommerceStatusToWarehouse(wooOrder.status),
        receiver: useShipping
          ? `${shippingAddress.first_name} ${shippingAddress.last_name}`.trim()
          : `${billingAddress.first_name} ${billingAddress.last_name}`.trim(),
        address: useShipping ? shippingAddress.address_1 : billingAddress.address_1,
        address_line2: useShipping ? shippingAddress.address_2 : billingAddress.address_2,
        city: useShipping ? shippingAddress.city : billingAddress.city,
        state: useShipping ? shippingAddress.state : billingAddress.state,
        postal_code: useShipping ? shippingAddress.postcode : billingAddress.postcode,
        country: useShipping ? shippingAddress.country : billingAddress.country,
        email: billingAddress.email,
        phone: billingAddress.phone,
        order_total: parseFloat(wooOrder.total),
        notes: wooOrder.customer_note || null,
        order_date: wooOrder.date_created,
        external_order_id: wooOrder.id,
        integration_id: integrationId
      };

      const { data: order, error: orderError } = await this.supabase
        .from('ops_orders')
        .insert(orderData)
        .select()
        .single();

      if (orderError) {
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      const orderItems = wooOrder.line_items.map(item => ({
        order_id: order.id,
        sku: item.sku || null,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        total_price: parseFloat(item.total),
        is_gift: false,
        external_product_id: item.product_id.toString(),
        external_variation_id: item.variation_id ? item.variation_id.toString() : null
      }));

      if (orderItems.length > 0) {
        const { error: itemsError } = await this.supabase
          .from('ops_order_items')
          .insert(orderItems);

        if (itemsError) {
          console.error('Failed to create order items:', itemsError);
        }
      }

      return {
        success: true,
        orderId: order.id,
        externalOrderId: wooOrder.id
      };
    } catch (error: any) {
      return {
        success: false,
        externalOrderId: wooOrder.id,
        error: error.message
      };
    }
  }

  async importOrdersFromWooCommerce(
    integrationId: string,
    options?: {
      status?: string;
      after?: string;
      limit?: number;
    }
  ): Promise<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
  }> {
    const integration = await this.integrationService.getIntegration(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    if (integration.platform_type !== 'WOOCOMMERCE') {
      throw new Error('Integration is not a WooCommerce integration');
    }

    const wooClient = new WooCommerceClient(integration.config);

    const logData = {
      integration_id: integrationId,
      sync_type: 'ORDER_IMPORT' as const,
      direction: 'INBOUND' as const,
      status: 'RUNNING' as const,
      records_processed: 0,
      records_failed: 0,
      started_at: new Date().toISOString()
    };

    const syncLog = await this.integrationService.createSyncLog(logData);

    const results = {
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      const params: any = {
        per_page: options?.limit || 100,
        page: 1
      };

      if (options?.status) {
        params.status = options.status;
      }

      if (options?.after) {
        params.after = options.after;
      }

      const orders = await wooClient.getOrders(params);
      results.total = orders.length;

      for (const wooOrder of orders) {
        const result = await this.importOrder(wooOrder, integrationId);

        if (result.success) {
          results.imported++;
        } else if (result.error?.includes('already imported')) {
          results.skipped++;
        } else {
          results.failed++;
          results.errors.push(`Order ${wooOrder.id}: ${result.error}`);
        }
      }

      await this.integrationService.updateSyncLog(syncLog.id, {
        status: results.failed === 0 ? 'SUCCESS' : (results.imported > 0 ? 'PARTIAL' : 'FAILED'),
        records_processed: results.imported + results.skipped,
        records_failed: results.failed,
        completed_at: new Date().toISOString(),
        details: results,
        error_details: results.errors.length > 0 ? { errors: results.errors } : undefined
      });

      await this.integrationService.updateIntegration(integrationId, {
        last_sync_at: new Date().toISOString(),
        sync_status: 'CONNECTED',
        error_message: undefined
      });

      return results;
    } catch (error: any) {
      await this.integrationService.updateSyncLog(syncLog.id, {
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        error_details: { error: error.message }
      });

      await this.integrationService.updateIntegration(integrationId, {
        sync_status: 'ERROR',
        error_message: error.message
      });

      throw error;
    }
  }

  async processWebhookOrder(
    integrationId: string,
    wooOrder: WooCommerceOrder
  ): Promise<ImportOrderResult> {
    const logData = {
      integration_id: integrationId,
      sync_type: 'WEBHOOK' as const,
      direction: 'INBOUND' as const,
      status: 'RUNNING' as const,
      records_processed: 0,
      records_failed: 0,
      started_at: new Date().toISOString()
    };

    const syncLog = await this.integrationService.createSyncLog(logData);

    try {
      const result = await this.importOrder(wooOrder, integrationId);

      await this.integrationService.updateSyncLog(syncLog.id, {
        status: result.success ? 'SUCCESS' : 'FAILED',
        records_processed: result.success ? 1 : 0,
        records_failed: result.success ? 0 : 1,
        completed_at: new Date().toISOString(),
        details: result,
        error_details: result.error ? { error: result.error } : undefined
      });

      return result;
    } catch (error: any) {
      await this.integrationService.updateSyncLog(syncLog.id, {
        status: 'FAILED',
        records_failed: 1,
        completed_at: new Date().toISOString(),
        error_details: { error: error.message }
      });

      throw error;
    }
  }
}
