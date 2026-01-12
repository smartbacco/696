import { Router, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { IntegrationService } from '../services/integration.service.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

const integrationService = new IntegrationService(supabaseAdmin);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const apiKeys = await integrationService.getApiKeys();
    res.json({ success: true, data: apiKeys });
  } catch (error: any) {
    console.error('Get API keys error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, permissions } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'Name and permissions array are required'
      });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const result = await integrationService.generateApiKey(name, permissions, userId);

    res.status(201).json({
      success: true,
      data: result,
      message: 'API key created successfully. Save this key securely - it will not be shown again.'
    });
  } catch (error: any) {
    console.error('Create API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await integrationService.revokeApiKey(id);
    res.json({ success: true, message: 'API key revoked successfully' });
  } catch (error: any) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;