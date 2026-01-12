import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/goods', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shipping_goods')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get shipping goods error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shipping goods' });
  }
});

router.get('/goods/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('shipping_goods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Shipping good not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get shipping good error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shipping good' });
  }
});

router.put('/goods/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('shipping_goods')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Shipping good not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update shipping good error:', error);
    res.status(500).json({ success: false, error: 'Failed to update shipping good' });
  }
});

router.get('/goods/:id/stock-log', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('shipping_goods_stock_log')
      .select('*')
      .eq('shipping_good_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get stock log error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stock log' });
  }
});

router.get('/shipments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*, orders(order_code, receiver)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get shipments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch shipments' });
  }
});

router.post('/shipments', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const shipmentData = req.body;

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .insert(shipmentData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({ success: false, error: 'Failed to create shipment' });
  }
});

router.get('/settings', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('carrier_settings')
      .select('*')
      .order('carrier_name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get carrier settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch carrier settings' });
  }
});

router.put('/settings/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('carrier_settings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Carrier setting not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update carrier setting error:', error);
    res.status(500).json({ success: false, error: 'Failed to update carrier setting' });
  }
});

export default router;
