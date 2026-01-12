import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGEMENT'));

router.get('/order-stats', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalResult, processingResult, todayResult] = await Promise.all([
      supabaseAdmin.from('ops_orders').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('ops_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PROCESSING', 'READY_TO_SHIP', 'PACKAGING']),
      supabaseAdmin
        .from('ops_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'SHIPPED')
        .gte('updated_at', new Date().toISOString().split('T')[0])
    ]);

    res.json({
      success: true,
      data: {
        total: totalResult.count || 0,
        processing: processingResult.count || 0,
        shippedToday: todayResult.count || 0
      }
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order stats' });
  }
});

router.get('/inventory-stats', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventory_cigars')
      .select('available, reorder_level')
      .eq('status', 'ACTIVE');

    if (error) throw error;

    const lowStock = data?.filter(inv => inv.available <= inv.reorder_level).length || 0;
    const outOfStock = data?.filter(inv => inv.available <= 0).length || 0;

    res.json({
      success: true,
      data: { lowStock, outOfStock }
    });
  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory stats' });
  }
});

router.get('/returns-count', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { count, error } = await supabaseAdmin
      .from('returns')
      .select('id', { count: 'exact', head: true })
      .in('status', ['PENDING', 'LABEL_SENT']);

    if (error) throw error;

    res.json({
      success: true,
      data: count || 0
    });
  } catch (error) {
    console.error('Get returns count error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch returns count' });
  }
});

router.get('/orders-attention', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .select('id, order_code, channel, status, receiver, created_at')
      .in('status', ['PROCESSING', 'READY_TO_SHIP'])
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get orders requiring attention error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

router.get('/low-stock-products', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventory_cigars')
      .select('id, product_id, on_hand, reserved, available, reorder_level, products_cigars(name)')
      .eq('status', 'ACTIVE')
      .order('available', { ascending: true })
      .limit(10);

    if (error) throw error;

    const lowStock = data?.filter(inv => inv.available <= inv.reorder_level) || [];

    res.json({ success: true, data: lowStock });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch low stock products' });
  }
});

export default router;
