import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { IntegrationService } from '../services/integration.service.js';
import { OrderImportService } from '../services/order-import.service.js';
import { InventorySyncService } from '../services/inventory-sync.service.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGEMENT'));

const integrationService = new IntegrationService(supabaseAdmin);
const orderImportService = new OrderImportService(supabaseAdmin, integrationService);
const inventorySyncService = new InventorySyncService(supabaseAdmin, integrationService);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const integrations = await integrationService.getIntegrations();
    res.json({ success: true, data: integrations });
  } catch (error: any) {
    console.error('Get integrations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const integration = await integrationService.getIntegration(id);

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    res.json({ success: true, data: integration });
  } catch (error: any) {
    console.error('Get integration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const integrationData = req.body;
    const integration = await integrationService.createIntegration(integrationData);
    res.status(201).json({ success: true, data: integration });
  } catch (error: any) {
    console.error('Create integration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const integration = await integrationService.updateIntegration(id, updates);
    res.json({ success: true, data: integration });
  } catch (error: any) {
    console.error('Update integration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await integrationService.deleteIntegration(id);
    res.json({ success: true, message: 'Integration deleted successfully' });
  } catch (error: any) {
    console.error('Delete integration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/test-connection', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { platform_type, config } = req.body;

    if (platform_type === 'WOOCOMMERCE') {
      const isConnected = await integrationService.testWooCommerceConnection(config);
      res.json({ success: true, connected: isConnected });
    } else {
      res.status(400).json({ success: false, error: 'Unsupported platform type' });
    }
  } catch (error: any) {
    console.error('Test connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/import-orders', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, after, limit } = req.body;

    const result = await orderImportService.importOrdersFromWooCommerce(id, {
      status,
      after,
      limit
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Import orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/sync-inventory', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { warehouseProductIds, forceSync } = req.body;

    const result = await inventorySyncService.syncInventoryToWooCommerce(id, {
      warehouseProductIds,
      forceSync
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Sync inventory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/auto-map-products', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await inventorySyncService.autoMapProductsBySku(id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Auto-map products error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/sync-logs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const logs = await integrationService.getSyncLogs(id, limit);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    console.error('Get sync logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/product-mappings', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mappings = await integrationService.getProductMappings(id);
    res.json({ success: true, data: mappings });
  } catch (error: any) {
    console.error('Get product mappings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/product-mappings', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mappingData = { ...req.body, integration_id: id };
    const mapping = await integrationService.createProductMapping(mappingData);
    res.status(201).json({ success: true, data: mapping });
  } catch (error: any) {
    console.error('Create product mapping error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/product-mappings/:mappingId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mappingId } = req.params;
    await integrationService.deleteProductMapping(mappingId);
    res.json({ success: true, message: 'Product mapping deleted successfully' });
  } catch (error: any) {
    console.error('Delete product mapping error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;