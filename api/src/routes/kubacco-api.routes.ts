import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { IntegrationService } from '../services/integration.service.js';

const router = Router();
const integrationService = new IntegrationService(supabaseAdmin);

interface ApiKeyRequest extends Request {
  apiKey?: any;
}

const authenticateApiKey = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing or invalid API key' });
      return;
    }

    const apiKey = authHeader.substring(7);
    const keyData = await integrationService.verifyApiKey(apiKey);

    if (!keyData) {
      res.status(401).json({ success: false, error: 'Invalid or expired API key' });
      return;
    }

    req.apiKey = keyData;
    next();
  } catch (error: any) {
    console.error('API key authentication error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

const checkPermission = (permission: string) => {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const permissions = req.apiKey.permissions || [];
    if (!permissions.includes(permission) && !permissions.includes('*')) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

router.use(authenticateApiKey);

router.get('/products', checkPermission('products:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { channel, status, search, page = '1', per_page = '50' } = req.query;

    let query = supabaseAdmin
      .from('products_cigars')
      .select(`
        *,
        blend:blends(*),
        product_variations(
          id,
          variation_id,
          sku,
          channels,
          wholesale_price,
          retail_price,
          is_active,
          variation:variations(
            id,
            name,
            qty,
            size_w_mm,
            size_l_mm,
            size_h_mm,
            weight_g
          )
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const pageNum = parseInt(page as string);
    const perPage = parseInt(per_page as string);
    const from = (pageNum - 1) * perPage;
    const to = from + perPage - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: count || 0
      }
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/products/:id', checkPermission('products:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products_cigars')
      .select(`
        *,
        blend:blends(*),
        product_variations(
          id,
          variation_id,
          sku,
          channels,
          wholesale_price,
          retail_price,
          is_active,
          variation:variations(
            id,
            name,
            qty,
            size_w_mm,
            size_l_mm,
            size_h_mm,
            weight_g
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/inventory', checkPermission('inventory:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { low_stock, product_id } = req.query;

    let query = supabaseAdmin
      .from('inventory_cigars')
      .select(`
        *,
        product:products_cigars(
          id,
          name,
          status,
          product_variations(
            id,
            variation_id,
            sku,
            wholesale_price,
            retail_price,
            variation:variations(
              id,
              name,
              qty
            )
          )
        )
      `)
      .order('available', { ascending: true });

    if (low_stock === 'true') {
      query = query.lt('available', 100);
    }

    if (product_id) {
      query = query.eq('product_id', product_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/orders', checkPermission('orders:create'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const orderData = {
      ...req.body,
      channel: 'WHOLESALE',
      status: 'PROCESSING',
      source: 'KUBACCO_APP'
    };

    const { data: order, error: orderError } = await supabaseAdmin
      .from('ops_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) throw orderError;

    if (req.body.items && Array.isArray(req.body.items)) {
      const orderItems = req.body.items.map((item: any) => ({
        ...item,
        order_id: order.id
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('ops_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Failed to create order items:', itemsError);
      }
    }

    const { data: fullOrder, error: fetchError } = await supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)')
      .eq('id', order.id)
      .single();

    if (fetchError) throw fetchError;

    res.status(201).json({ success: true, data: fullOrder });
  } catch (error: any) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/orders', checkPermission('orders:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { status, page = '1', per_page = '25' } = req.query;

    let query = supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)', { count: 'exact' })
      .eq('channel', 'WHOLESALE')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const pageNum = parseInt(page as string);
    const perPage = parseInt(per_page as string);
    const from = (pageNum - 1) * perPage;
    const to = from + perPage - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: count || 0
      }
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/orders/:id', checkPermission('orders:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('ops_orders')
      .select('*, ops_order_items(*)')
      .eq('id', id)
      .eq('channel', 'WHOLESALE')
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/bundles', checkPermission('products:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bundles')
      .select('*')
      .overlaps('channels', ['WHOLESALE', 'BOTH'])
      .order('name');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get bundles error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/accessories', checkPermission('products:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('accessories')
      .select('*')
      .overlaps('channels', ['WHOLESALE', 'BOTH'])
      .order('name');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get accessories error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/retailers', checkPermission('customers:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { search, status, page = '1', per_page = '50' } = req.query;

    let query = supabaseAdmin
      .from('ops_customers')
      .select(`
        *,
        customer_locations(
          id,
          location_name,
          contact_person,
          contact_phone,
          address,
          address_line2,
          city,
          state,
          postal_code,
          country,
          is_default,
          is_active
        )
      `, { count: 'exact' })
      .order('name', { ascending: true });

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const pageNum = parseInt(page as string);
    const perPage = parseInt(per_page as string);
    const from = (pageNum - 1) * perPage;
    const to = from + perPage - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: count || 0
      }
    });
  } catch (error: any) {
    console.error('Get retailers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/retailers/:id', checkPermission('customers:read'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('ops_customers')
      .select(`
        *,
        customer_locations(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ success: false, error: 'Retailer not found' });
      return;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get retailer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;