import { SupabaseClient } from '@supabase/supabase-js';
import { WooCommerceClient } from './woocommerce-client.js';

export interface SyncResult {
  success: boolean;
  syncLogId: string;
  orderId: string;
  platformType: string;
  newStatus: string;
  error?: string;
  retryCount?: number;
}

export interface OutboundSyncLog {
  id: string;
  order_id: string;
  integration_id: string;
  platform_type: string;
  channel: string;
  old_status: string;
  new_status: string;
  result: string;
  error_message?: string;
  retry_count: number;
  last_retry_at?: string;
  synced_at?: string;
}

export class OrderStatusSyncService {
  constructor(private supabase: SupabaseClient) {}

  async syncStatusToExternalPlatform(
    orderId: string,
    newStatus: string,
    wooCommerceClient?: WooCommerceClient
  ): Promise<SyncResult> {
    try {
      const { data: order, error: orderError } = await this.supabase
        .from('ops_orders')
        .select('id, channel, import_source, external_order_id, integration_id, status')
        .eq('id', orderId)
        .maybeSingle();

      if (orderError || !order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const { data: integration, error: integrationError } = await this.supabase
        .from('integrations')
        .select('id, platform_type, config')
        .eq('id', order.integration_id)
        .maybeSingle();

      if (integrationError || !integration) {
        throw new Error(`Integration not found for order ${orderId}`);
      }

      this.validateChannelSegregation(order.channel, integration.platform_type);

      const oldStatus = order.status;
      let syncResult: SyncResult;

      if (integration.platform_type === 'WOOCOMMERCE') {
        syncResult = await this.syncToWooCommerce(
          order,
          integration,
          newStatus,
          oldStatus,
          wooCommerceClient
        );
      } else if (integration.platform_type === 'KUBACCO_APP') {
        syncResult = await this.syncToKubacco(order, integration, newStatus, oldStatus);
      } else {
        throw new Error(
          `Unsupported platform type: ${integration.platform_type}`
        );
      }

      return syncResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const { data: syncLog } = await this.createSyncLog({
        orderId,
        integrationId: '',
        platformType: 'UNKNOWN',
        channel: '',
        oldStatus: '',
        newStatus,
        result: 'FAILED',
        errorMessage
      });

      return {
        success: false,
        syncLogId: syncLog?.id || '',
        orderId,
        platformType: 'UNKNOWN',
        newStatus,
        error: errorMessage
      };
    }
  }

  private validateChannelSegregation(
    orderChannel: string,
    platformType: string
  ): void {
    const validCombinations: Record<string, string> = {
      WHOLESALE: 'KUBACCO_APP',
      ONLINE: 'WOOCOMMERCE'
    };

    const expectedPlatform = validCombinations[orderChannel];

    if (platformType !== expectedPlatform) {
      throw new Error(
        `Channel segregation violation: ${orderChannel} orders cannot sync to ${platformType}. Expected: ${expectedPlatform}`
      );
    }
  }

  private async syncToWooCommerce(
    order: any,
    integration: any,
    newStatus: string,
    oldStatus: string,
    wooCommerceClient?: WooCommerceClient
  ): Promise<SyncResult> {
    if (!wooCommerceClient) {
      throw new Error('WooCommerceClient not provided');
    }

    const externalOrderId = parseInt(order.external_order_id);
    if (isNaN(externalOrderId)) {
      throw new Error(`Invalid WooCommerce order ID: ${order.external_order_id}`);
    }

    const wooStatus = this.mapToWooCommerceStatus(newStatus);

    await wooCommerceClient.updateOrderStatus(externalOrderId, wooStatus);

    const syncLog = await this.createSyncLog({
      orderId: order.id,
      integrationId: integration.id,
      platformType: 'WOOCOMMERCE',
      channel: order.channel,
      oldStatus,
      newStatus,
      result: 'SUCCESS',
      syncedAt: new Date().toISOString()
    });

    return {
      success: true,
      syncLogId: syncLog.data!.id,
      orderId: order.id,
      platformType: 'WOOCOMMERCE',
      newStatus
    };
  }

  private async syncToKubacco(
    order: any,
    integration: any,
    newStatus: string,
    oldStatus: string
  ): Promise<SyncResult> {
    const kubaccoOrderId = order.external_order_id;
    if (!kubaccoOrderId) {
      throw new Error(`No Kubacco order ID found for order ${order.id}`);
    }

    const kubacoStatus = this.mapToKubaccoStatus(newStatus);

    const apiKey = integration.config?.apiKey;
    if (!apiKey) {
      throw new Error('Kubacco API key not configured');
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/kubacco-update-order-status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          order_id: kubaccoOrderId,
          status: kubacoStatus
        })
      }
    );

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      try {
        const errorData = await response.json() as { error?: string };
        errorMessage = errorData.error || 'Unknown error';
      } catch (e) {
        // If JSON parsing fails, use generic error
      }
      throw new Error(
        `Kubacco API error: ${response.status} - ${errorMessage}`
      );
    }

    const syncLog = await this.createSyncLog({
      orderId: order.id,
      integrationId: integration.id,
      platformType: 'KUBACCO_APP',
      channel: order.channel,
      oldStatus,
      newStatus,
      result: 'SUCCESS',
      syncedAt: new Date().toISOString()
    });

    return {
      success: true,
      syncLogId: syncLog.data!.id,
      orderId: order.id,
      platformType: 'KUBACCO_APP',
      newStatus
    };
  }

  private mapToWooCommerceStatus(warehouseStatus: string): string {
    const statusMap: Record<string, string> = {
      PROCESSING: 'processing',
      READY_TO_SHIP: 'processing',
      SHIPMENT_CREATED: 'processing',
      PACKAGING: 'processing',
      SHIPPED: 'completed',
      IN_TRANSIT: 'completed',
      DELIVERED: 'completed',
      CANCELLED: 'cancelled',
      RETURNED: 'refunded'
    };

    return statusMap[warehouseStatus] || 'processing';
  }

  private mapToKubaccoStatus(warehouseStatus: string): string {
    const statusMap: Record<string, string> = {
      PROCESSING: 'processing',
      READY_TO_SHIP: 'processing',
      SHIPMENT_CREATED: 'processing',
      PACKAGING: 'processing',
      SHIPPED: 'completed',
      IN_TRANSIT: 'in-transit',
      DELIVERED: 'completed',
      CANCELLED: 'cancelled',
      RETURNED: 'refunded'
    };

    return statusMap[warehouseStatus] || 'processing';
  }

  private async createSyncLog(data: {
    orderId: string;
    integrationId: string;
    platformType: string;
    channel: string;
    oldStatus: string;
    newStatus: string;
    result: string;
    errorMessage?: string;
    syncedAt?: string;
  }) {
    return this.supabase
      .from('integration_outbound_sync_logs')
      .insert({
        order_id: data.orderId,
        integration_id: data.integrationId,
        platform_type: data.platformType,
        channel: data.channel,
        old_status: data.oldStatus,
        new_status: data.newStatus,
        result: data.result,
        error_message: data.errorMessage,
        synced_at: data.syncedAt,
        retry_count: 0
      })
      .select()
      .single();
  }

  async retrySyncLog(syncLogId: string, wooCommerceClient?: WooCommerceClient): Promise<SyncResult> {
    try {
      const { data: syncLog, error: logError } = await this.supabase
        .from('integration_outbound_sync_logs')
        .select('*')
        .eq('id', syncLogId)
        .maybeSingle();

      if (logError || !syncLog) {
        throw new Error(`Sync log not found: ${syncLogId}`);
      }

      if (syncLog.retry_count >= 5) {
        throw new Error('Maximum retry attempts exceeded (5)');
      }

      const { data: order } = await this.supabase
        .from('ops_orders')
        .select('*')
        .eq('id', syncLog.order_id)
        .maybeSingle();

      if (!order) {
        throw new Error(`Order not found: ${syncLog.order_id}`);
      }

      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('id', syncLog.integration_id)
        .maybeSingle();

      if (!integration) {
        throw new Error(`Integration not found: ${syncLog.integration_id}`);
      }

      let result: SyncResult;

      if (syncLog.platform_type === 'WOOCOMMERCE') {
        result = await this.syncToWooCommerce(
          order,
          integration,
          syncLog.new_status,
          syncLog.old_status,
          wooCommerceClient
        );
      } else if (syncLog.platform_type === 'KUBACCO_APP') {
        result = await this.syncToKubacco(order, integration, syncLog.new_status, syncLog.old_status);
      } else {
        throw new Error(`Unknown platform type: ${syncLog.platform_type}`);
      }

      await this.supabase
        .from('integration_outbound_sync_logs')
        .update({
          retry_count: syncLog.retry_count + 1,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', syncLogId);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.supabase
        .from('integration_outbound_sync_logs')
        .update({
          retry_count: (await this.supabase
            .from('integration_outbound_sync_logs')
            .select('retry_count')
            .eq('id', syncLogId)
            .maybeSingle()).data?.retry_count || 0 + 1,
          last_retry_at: new Date().toISOString(),
          error_message: errorMessage
        })
        .eq('id', syncLogId);

      return {
        success: false,
        syncLogId,
        orderId: '',
        platformType: '',
        newStatus: '',
        error: errorMessage
      };
    }
  }

  async getSyncHistory(orderId: string) {
    const { data, error } = await this.supabase
      .from('integration_outbound_sync_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getFailedSyncs(limit: number = 50) {
    const { data, error } = await this.supabase
      .from('integration_outbound_sync_logs')
      .select('*')
      .eq('result', 'FAILED')
      .lt('retry_count', 5)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}
