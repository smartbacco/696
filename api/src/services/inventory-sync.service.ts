import { SupabaseClient } from '@supabase/supabase-js';
import { WooCommerceClient } from './woocommerce-client.js';
import { IntegrationService, ProductMapping } from './integration.service.js';

export interface InventorySyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export class InventorySyncService {
  constructor(
    private supabase: SupabaseClient,
    private integrationService: IntegrationService
  ) {}

  async syncInventoryToWooCommerce(
    integrationId: string,
    options?: {
      warehouseProductIds?: string[];
      forceSync?: boolean;
    }
  ): Promise<InventorySyncResult> {
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
      sync_type: 'INVENTORY_EXPORT' as const,
      direction: 'OUTBOUND' as const,
      status: 'RUNNING' as const,
      records_processed: 0,
      records_failed: 0,
      started_at: new Date().toISOString()
    };

    const syncLog = await this.integrationService.createSyncLog(logData);

    const results: InventorySyncResult = {
      total: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    try {
      let mappings = await this.integrationService.getProductMappings(integrationId);

      mappings = mappings.filter(m => m.sync_inventory);

      if (options?.warehouseProductIds && options.warehouseProductIds.length > 0) {
        mappings = mappings.filter(m =>
          options.warehouseProductIds!.includes(m.warehouse_product_id)
        );
      }

      results.total = mappings.length;

      const updates: Array<{ id: number; stock_quantity: number }> = [];

      for (const mapping of mappings) {
        try {
          const inventory = await this.getWarehouseInventory(
            mapping.warehouse_product_id,
            mapping.warehouse_product_type,
            mapping.warehouse_variation_id
          );

          if (inventory === null) {
            results.skipped++;
            results.errors.push(
              `Product ${mapping.warehouse_product_id} not found in warehouse`
            );
            continue;
          }

          const productId = parseInt(mapping.external_product_id);
          const variationId = mapping.external_variation_id
            ? parseInt(mapping.external_variation_id)
            : null;

          if (variationId) {
            await wooClient.updateProductVariationStock(
              productId,
              variationId,
              inventory
            );
          } else {
            updates.push({
              id: productId,
              stock_quantity: inventory
            });
          }

          await this.supabase
            .from('product_mappings')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', mapping.id);

          results.synced++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(
            `Mapping ${mapping.id}: ${error.message}`
          );
        }
      }

      if (updates.length > 0) {
        try {
          await wooClient.batchUpdateProducts(updates);
        } catch (error: any) {
          results.errors.push(`Batch update failed: ${error.message}`);
        }
      }

      await this.integrationService.updateSyncLog(syncLog.id, {
        status: results.failed === 0 ? 'SUCCESS' : (results.synced > 0 ? 'PARTIAL' : 'FAILED'),
        records_processed: results.synced + results.skipped,
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

  private async getWarehouseInventory(
    productId: string,
    productType: string,
    variationId?: string
  ): Promise<number | null> {
    if (productType === 'CIGAR' && variationId) {
      const { data, error } = await this.supabase
        .from('inventory_cigars')
        .select('available')
        .eq('product_id', productId)
        .eq('variation_id', variationId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cigar inventory:', error);
        return null;
      }

      return data?.available ?? 0;
    }

    if (productType === 'BUNDLE') {
      const { data, error } = await this.supabase
        .from('bundles')
        .select('stock_quantity')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching bundle inventory:', error);
        return null;
      }

      return data?.stock_quantity ?? 0;
    }

    if (productType === 'ACCESSORY') {
      const { data, error } = await this.supabase
        .from('accessories')
        .select('stock_quantity')
        .eq('id', productId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching accessory inventory:', error);
        return null;
      }

      return data?.stock_quantity ?? 0;
    }

    return null;
  }

  async autoMapProductsBySku(integrationId: string): Promise<{
    mapped: number;
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

    const results = {
      mapped: 0,
      errors: [] as string[]
    };

    try {
      const wooProducts = await wooClient.getProducts({ per_page: 100 });

      const { data: variations, error: varError } = await this.supabase
        .from('variations')
        .select('id, sku, product_id');

      if (varError) throw varError;

      for (const wooProduct of wooProducts) {
        if (!wooProduct.sku) continue;

        const matchingVariation = variations?.find(v => v.sku === wooProduct.sku);

        if (matchingVariation) {
          const existingMapping = await this.integrationService.findProductMappingBySku(
            integrationId,
            wooProduct.sku
          );

          if (!existingMapping) {
            try {
              await this.integrationService.createProductMapping({
                integration_id: integrationId,
                warehouse_product_id: matchingVariation.product_id,
                warehouse_product_type: 'CIGAR',
                warehouse_variation_id: matchingVariation.id,
                external_product_id: wooProduct.id.toString(),
                sku: wooProduct.sku,
                sync_inventory: true
              });

              results.mapped++;
            } catch (error: any) {
              results.errors.push(
                `Failed to map SKU ${wooProduct.sku}: ${error.message}`
              );
            }
          }
        }
      }

      return results;
    } catch (error: any) {
      throw new Error(`Auto-mapping failed: ${error.message}`);
    }
  }

  async syncSingleProduct(
    integrationId: string,
    warehouseProductId: string,
    warehouseVariationId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.syncInventoryToWooCommerce(integrationId, {
        warehouseProductIds: [warehouseProductId],
        forceSync: true
      });

      return {
        success: result.synced > 0,
        error: result.errors.length > 0 ? result.errors[0] : undefined
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
