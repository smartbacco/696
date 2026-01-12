import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/cigars', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products_cigars')
      .select('*, blends(name)')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get cigars error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cigars' });
  }
});

router.get('/cigars/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products_cigars')
      .select('*, blends(name), variations(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Cigar not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cigar' });
  }
});

router.post('/cigars', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cigarData = req.body;

    const { data, error } = await supabaseAdmin
      .from('products_cigars')
      .insert(cigarData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Create cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to create cigar' });
  }
});

router.put('/cigars/:id', requireRole('ADMIN', 'MANAGEMENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('products_cigars')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Cigar not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Update cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to update cigar' });
  }
});

router.delete('/cigars/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('products_cigars')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Cigar deleted successfully' });
  } catch (error) {
    console.error('Delete cigar error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete cigar' });
  }
});

router.get('/variations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('variations')
      .select('*, products_cigars(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get variations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch variations' });
  }
});

router.get('/bundles', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bundles')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get bundles error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bundles' });
  }
});

router.get('/accessories', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('accessories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get accessories error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch accessories' });
  }
});

router.get('/blends', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('blends')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get blends error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch blends' });
  }
});

export default router;
