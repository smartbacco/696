import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { OrderStatus, Channel } from '../types/index.js';
import { OrderStatusSyncService } from '../services/order-status-sync.service.js';
import { WooCommerceClient } from '../services/woocommerce-client.js';

const syncService = new OrderStatusSyncService(supabaseAdmin);

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      search,
      status,
      channel,
      batch,
      minAge,
      page = '1',
      pageSize = '25',
      hideShipped = 'true'
    } = req.query;

    let query = supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)', { count: 'exact' });

    if (search && typeof search === 'string') {
      query = query.or(
        `order_code.ilike.%${search}%,receiver.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    if (status && typeof status === 'string') {
      const statuses = status.split(',');
      query = query.in('status', statuses);
    } else if (hideShipped === 'true') {
      query = query.not('status', 'in', '("SHIPPED","IN_TRANSIT","DELIVERED","CANCELLED","RETURNED")');
    }

    if (channel && channel !== 'ALL') {
      query = query.eq('channel', channel);
    }

    if (batch && typeof batch === 'string') {
      query = query.eq('batch', batch);
    }

    if (minAge && typeof minAge === 'string') {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(minAge));
      query = query.lte('created_at', daysAgo.toISOString());
    }

    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const from = (pageNum - 1) * pageSizeNum;
    const to = from + pageSizeNum - 1;

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSizeNum)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
});

router.post('/', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orderData = req.body;

    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .insert(orderData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

router.put('/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: oldOrder } = await supabaseAdmin
      .from('ops_orders')
      .select('status, integration_id, channel')
      .eq('id', id)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .update(updates)
      .eq('id', id)
      .select('*, ops_order_items(*)')
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    let syncResult = null;
    if (updates.status && oldOrder && updates.status !== oldOrder.status) {
      try {
        syncResult = await syncService.syncStatusToExternalPlatform(id, updates.status);
      } catch (syncError) {
        console.error('Status sync failed:', syncError);
        syncResult = {
          success: false,
          error: syncError instanceof Error ? syncError.message : String(syncError)
        };
      }
    }

    res.json({
      success: true,
      data,
      syncResult: syncResult || { success: false, message: 'No status change' }
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error: itemsError } = await supabaseAdmin
      .from('ops_order_items')
      .delete()
      .eq('order_id', id);

    if (itemsError) throw itemsError;

    const { error } = await supabaseAdmin
      .from('ops_orders')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
});

router.post('/bulk-update-status', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderIds, status } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || !status) {
      res.status(400).json({ success: false, error: 'orderIds array and status are required' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .update({ status })
      .in('id', orderIds)
      .select();

    if (error) throw error;

    const syncResults = [];
    for (const orderId of orderIds) {
      try {
        const syncResult = await syncService.syncStatusToExternalPlatform(orderId, status);
        syncResults.push(syncResult);
      } catch (syncError) {
        console.error(`Sync failed for order ${orderId}:`, syncError);
        syncResults.push({
          success: false,
          orderId,
          platformType: 'UNKNOWN',
          newStatus: status,
          error: syncError instanceof Error ? syncError.message : String(syncError),
          syncLogId: ''
        });
      }
    }

    res.json({
      success: true,
      data,
      syncResults
    });
  } catch (error) {
    console.error('Bulk update orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to update orders' });
  }
});

router.post('/:orderId/retry-sync/:syncLogId', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, syncLogId } = req.params;

    const { data: syncLog, error: logError } = await supabaseAdmin
      .from('integration_outbound_sync_logs')
      .select('*')
      .eq('id', syncLogId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (logError || !syncLog) {
      res.status(404).json({ success: false, error: 'Sync log not found' });
      return;
    }

    const result = await syncService.retrySyncLog(syncLogId);

    res.json({
      success: result.success,
      data: {
        orderId: result.orderId,
        syncLogId: result.syncLogId,
        platformType: result.platformType,
        newStatus: result.newStatus,
        retryCount: result.retryCount
      },
      error: result.error
    });
  } catch (error) {
    console.error('Retry sync error:', error);
    res.status(500).json({ success: false, error: 'Failed to retry sync' });
  }
});

router.get('/:orderId/sync-history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;

    const history = await syncService.getSyncHistory(orderId);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get sync history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sync history' });
  }
});

router.get('/failed-syncs/list', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = '50' } = req.query;
    const failedSyncs = await syncService.getFailedSyncs(parseInt(limit as string));

    res.json({
      success: true,
      data: failedSyncs,
      count: failedSyncs.length
    });
  } catch (error) {
    console.error('Get failed syncs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch failed syncs' });
  }
});

export default router;
