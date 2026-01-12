import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user || !data.session) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, full_name, active')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData || !userData.active) {
      res.status(401).json({ success: false, error: 'User account not found or inactive' });
      return;
    }

    res.json({
      success: true,
      data: {
        user: userData,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, full_name, active')
      .eq('id', req.user.id)
      .single();

    if (error || !userData) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: userData });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

export default router;
