import { SupabaseClient } from '@supabase/supabase-js';
import { WooCommerceClient, WooCommerceConfig } from './woocommerce-client.js';
import crypto from 'crypto';

export interface Integration {
  id: string;
  platform_type: 'WOOCOMMERCE' | 'KUBACCO_APP' | 'SHOPIFY' | 'CUSTOM';
  name: string;
  is_active: boolean;
  config: any;
  last_sync_at?: string;
  sync_status: 'CONNECTED' | 'ERROR' | 'DISCONNECTED';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  integration_id: string;
  sync_type: 'ORDER_IMPORT' | 'INVENTORY_EXPORT' | 'PRODUCT_SYNC' | 'WEBHOOK' | 'MANUAL_SYNC';
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'RUNNING';
  records_processed: number;
  records_failed: number;
  details?: any;
  error_details?: any;
  started_at: string;
  completed_at?: string;
}

export interface ProductMapping {
  id: string;
  integration_id: string;
  warehouse_product_id: string;
  warehouse_product_type: 'CIGAR' | 'BUNDLE' | 'ACCESSORY';
  warehouse_variation_id?: string;
  external_product_id: string;
  external_variation_id?: string;
  sku?: string;
  sync_inventory: boolean;
  last_synced_at?: string;
}

export class IntegrationService {
  constructor(private supabase: SupabaseClient) {}

  async createIntegration(data: Partial<Integration>): Promise<Integration> {
    const { data: integration, error } = await this.supabase
      .from('integrations')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return integration;
  }

  async getIntegrations(): Promise<Integration[]> {
    const { data, error } = await this.supabase
      .from('integrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getIntegration(id: string): Promise<Integration | null> {
    const { data, error } = await this.supabase
      .from('integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration> {
    const { data, error } = await this.supabase
      .from('integrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteIntegration(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('integrations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async testWooCommerceConnection(config: WooCommerceConfig): Promise<boolean> {
    try {
      const client = new WooCommerceClient(config);
      return await client.testConnection();
    } catch (error) {
      console.error('WooCommerce test connection error:', error);
      return false;
    }
  }

  async createSyncLog(data: Partial<SyncLog>): Promise<SyncLog> {
    const { data: log, error } = await this.supabase
      .from('integration_sync_logs')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return log;
  }

  async updateSyncLog(id: string, updates: Partial<SyncLog>): Promise<SyncLog> {
    const { data: log, error } = await this.supabase
      .from('integration_sync_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return log;
  }

  async getSyncLogs(integrationId?: string, limit = 50): Promise<SyncLog[]> {
    let query = this.supabase
      .from('integration_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (integrationId) {
      query = query.eq('integration_id', integrationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createProductMapping(data: Partial<ProductMapping>): Promise<ProductMapping> {
    const { data: mapping, error } = await this.supabase
      .from('product_mappings')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return mapping;
  }

  async getProductMappings(integrationId: string): Promise<ProductMapping[]> {
    const { data, error } = await this.supabase
      .from('product_mappings')
      .select('*')
      .eq('integration_id', integrationId);

    if (error) throw error;
    return data || [];
  }

  async findProductMappingBySku(integrationId: string, sku: string): Promise<ProductMapping | null> {
    const { data, error } = await this.supabase
      .from('product_mappings')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('sku', sku)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async findProductMappingByExternalId(
    integrationId: string,
    externalProductId: string,
    externalVariationId?: string
  ): Promise<ProductMapping | null> {
    let query = this.supabase
      .from('product_mappings')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('external_product_id', externalProductId);

    if (externalVariationId) {
      query = query.eq('external_variation_id', externalVariationId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }

  async deleteProductMapping(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('product_mappings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async generateApiKey(name: string, permissions: string[], createdBy: string): Promise<{
    id: string;
    key: string;
    key_prefix: string;
  }> {
    const key = `kb_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const keyPrefix = key.substring(0, 12);

    const { data, error } = await this.supabase
      .from('api_keys')
      .insert({
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions,
        created_by: createdBy
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      key,
      key_prefix: keyPrefix
    };
  }

  async verifyApiKey(key: string): Promise<any | null> {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const { data, error } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (data && data.expires_at && new Date(data.expires_at) < new Date()) {
      return null;
    }

    if (data) {
      await this.supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);
    }

    return data;
  }

  async getApiKeys(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, name, key_prefix, permissions, is_active, last_used_at, expires_at, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async revokeApiKey(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
  }

  async queueWebhook(
    integrationId: string,
    eventType: string,
    payload: any,
    signature?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_queue')
      .insert({
        integration_id: integrationId,
        event_type: eventType,
        payload,
        signature,
        status: 'PENDING'
      });

    if (error) throw error;
  }

  async getPendingWebhooks(limit = 10): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('webhook_queue')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async updateWebhookStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const updates: any = {
      status,
      processed_at: new Date().toISOString()
    };

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const { error } = await this.supabase
      .from('webhook_queue')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  }
}
