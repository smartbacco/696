import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/cigars', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventory_cigars')
      .select('*, product_id, variation_id, products_cigars(name), variations(sku)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get inventory cigars error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
  }
});

router.get('/cigars/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('inventory_cigars')
      .select('*, products_cigars(name), variations(sku)')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Inventory item not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get inventory cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory item' });
  }
});

router.put('/cigars/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('inventory_cigars')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Inventory item not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update inventory cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to update inventory' });
  }
});

router.post('/cigars/bulk-adjust', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adjustments } = req.body;

    if (!adjustments || !Array.isArray(adjustments)) {
      res.status(400).json({ success: false, error: 'adjustments array is required' });
      return;
    }

    const results = [];

    for (const adj of adjustments) {
      const { id, on_hand, reserved, available } = adj;

      const { data, error } = await supabaseAdmin
        .from('inventory_cigars')
        .update({ on_hand, reserved, available })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      results.push(data);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Bulk adjust inventory error:', error);
    res.status(500).json({ success: false, error: 'Failed to adjust inventory' });
  }
});

// Accessories inventory routes
router.get('/accessories', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventory_accessories')
      .select('*, accessories(id, name, sku, category_id, accessory_categories(name))')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get inventory accessories error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
  }
});

router.get('/accessories/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('inventory_accessories')
      .select('*, accessories(id, name, sku, category_id, accessory_categories(name))')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Inventory item not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get inventory accessory error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory item' });
  }
});

router.put('/accessories/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('inventory_accessories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Inventory item not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update inventory accessory error:', error);
    res.status(500).json({ success: false, error: 'Failed to update inventory' });
  }
});

router.post('/accessories/bulk-adjust', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { adjustments } = req.body;

    if (!adjustments || !Array.isArray(adjustments)) {
      res.status(400).json({ success: false, error: 'adjustments array is required' });
      return;
    }

    const results = [];

    for (const adj of adjustments) {
      const { id, on_hand, reserved } = adj;

      const { data, error } = await supabaseAdmin
        .from('inventory_accessories')
        .update({ on_hand, reserved })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      results.push(data);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Bulk adjust accessories inventory error:', error);
    res.status(500).json({ success: false, error: 'Failed to adjust inventory' });
  }
});

router.get('/accessories/:id/receipts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('stock_receipts_accessories')
      .select('*, accessories(name), users(name)')
      .eq('accessory_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get accessory receipts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch receipts' });
  }
});

router.get('/accessories/:id/adjustments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('stock_adjustments_accessories')
      .select('*, accessories(name), users(name)')
      .eq('accessory_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get accessory adjustments error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch adjustments' });
  }
});

export default router;
