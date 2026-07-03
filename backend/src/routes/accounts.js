/**
 * accounts.js — User-scoped account endpoints
 */

import { Router } from 'express';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Require authentication for all accounts endpoints
router.use(authenticateUser);

// GET /api/accounts — returns only the logged-in user's accounts
router.get('/', (req, res) => {
  try {
    const accounts = db.prepare(
      'SELECT id, name, balance FROM accounts WHERE user_id = ? ORDER BY name ASC'
    ).all(req.userId);

    res.json({ accounts });
  } catch (err) {
    console.error('[GET /api/accounts] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve accounts.' });
  }
});

// GET /api/accounts/recipients — returns accounts of OTHER users for transfers
router.get('/recipients', (req, res) => {
  try {
    const recipients = db.prepare(`
      SELECT a.id, a.name AS account_name, u.name AS owner_name
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE a.user_id != ?
      ORDER BY u.name ASC, a.name ASC
    `).all(req.userId);

    res.json({ recipients });
  } catch (err) {
    console.error('[GET /api/accounts/recipients] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve transfer recipients.' });
  }
});

export default router;
