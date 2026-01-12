import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/database.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search = '',
      page = '1',
      per_page = '50',
      sort_by = 'last_order_date',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const perPage = Math.min(parseInt(per_page as string), 100);
    const from = (pageNum - 1) * perPage;
    const to = from + perPage - 1;

    console.log('[Customers API] Refreshing customer summary...');
    const { error: refreshError } = await supabaseAdmin.rpc('refresh_customer_summary');
    if (refreshError) {
      console.error('[Customers API] Failed to refresh customer summary:', refreshError);
    }

    let query = supabaseAdmin
      .from('customer_summary')
      .select('*', { count: 'exact' });

    if (search && search !== '') {
      const searchTerm = `%${search}%`;
      query = query.or(`email.ilike.${searchTerm},customer_name.ilike.${searchTerm},phone.ilike.${searchTerm},primary_city.ilike.${searchTerm},primary_state.ilike.${searchTerm}`);
    }

    const validSortFields = ['customer_name', 'email', 'total_orders', 'total_spent', 'last_order_date', 'first_order_date'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by as string : 'last_order_date';
    const ascending = sort_order === 'asc';

    query = query.order(sortField, { ascending });
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Customers API] Query error:', error);
      throw error;
    }

    console.log(`[Customers API] Found ${count || 0} customers`);

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage)
      }
    });
  } catch (error: any) {
    console.error('[Customers API] Get customers error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.hint || error.details || 'Unknown error'
    });
  }
});

router.get('/:email/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;
    const {
      status,
      page = '1',
      per_page = '25',
      sort_order = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const perPage = Math.min(parseInt(per_page as string), 100);
    const from = (pageNum - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)', { count: 'exact' })
      .eq('email', email)
      .eq('channel', 'ONLINE');

    if (status) {
      query = query.eq('status', status);
    }

    const ascending = sort_order === 'asc';
    query = query.order('created_at', { ascending });
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / perPage)
      }
    });
  } catch (error: any) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;

    await supabaseAdmin.rpc('refresh_customer_summary');

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customer_summary')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (customerError) throw customerError;

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    const { data: addresses, error: addressError } = await supabaseAdmin
      .from('ops_orders')
      .select('address, address_line2, city, state, postal_code, country')
      .eq('email', email)
      .eq('channel', 'ONLINE')
      .order('created_at', { ascending: false })
      .limit(5);

    if (addressError) throw addressError;

    const uniqueAddresses = addresses?.filter((addr, index, self) =>
      index === self.findIndex(a =>
        a.address === addr.address &&
        a.city === addr.city &&
        a.state === addr.state
      )
    ) || [];

    res.json({
      success: true,
      data: {
        ...customer,
        addresses: uniqueAddresses
      }
    });
  } catch (error: any) {
    console.error('Get customer detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
