import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { IntegrationService } from '../services/integration.service.js';
import { OrderImportService } from '../services/order-import.service.js';
import { WooCommerceClient, WooCommerceOrder } from '../services/woocommerce-client.js';

const router = Router();

const integrationService = new IntegrationService(supabaseAdmin);
const orderImportService = new OrderImportService(supabaseAdmin, integrationService);

router.post('/woocommerce/:integrationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { integrationId } = req.params;
    const signature = req.headers['x-wc-webhook-signature'] as string;
    const payload = req.body;

    const integration = await integrationService.getIntegration(integrationId);
    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    if (!integration.is_active) {
      res.status(400).json({ success: false, error: 'Integration is not active' });
      return;
    }

    const webhookSecret = integration.config.webhookSecret;
    if (webhookSecret && signature) {
      const wooClient = new WooCommerceClient(integration.config);
      const isValid = wooClient.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        webhookSecret
      );

      if (!isValid) {
        res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        return;
      }
    }

    const topic = req.headers['x-wc-webhook-topic'] as string;
    const event = req.headers['x-wc-webhook-event'] as string;

    await integrationService.queueWebhook(
      integrationId,
      topic || event || 'unknown',
      payload,
      signature
    );

    if (topic === 'order.created' || topic === 'order.updated') {
      try {
        const wooOrder = payload as WooCommerceOrder;
        await orderImportService.processWebhookOrder(integrationId, wooOrder);
      } catch (error) {
        console.error('Error processing webhook order:', error);
      }
    }

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const { data, error } = await supabaseAdmin
      .from('webhook_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get webhook queue error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/queue/:id/retry', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: webhook, error: fetchError } = await supabaseAdmin
      .from('webhook_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!webhook) {
      res.status(404).json({ success: false, error: 'Webhook not found' });
      return;
    }

    if (webhook.event_type === 'order.created' || webhook.event_type === 'order.updated') {
      try {
        await orderImportService.processWebhookOrder(
          webhook.integration_id,
          webhook.payload as WooCommerceOrder
        );

        await integrationService.updateWebhookStatus(id, 'COMPLETED');
        res.json({ success: true, message: 'Webhook retried successfully' });
      } catch (error: any) {
        await integrationService.updateWebhookStatus(id, 'FAILED', error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    } else {
      res.status(400).json({ success: false, error: 'Unsupported webhook event type' });
    }
  } catch (error: any) {
    console.error('Retry webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;