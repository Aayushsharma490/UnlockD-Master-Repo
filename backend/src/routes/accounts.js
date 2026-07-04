/**
 * accounts.js — User-scoped account endpoints (PostgreSQL)
 */

import { Router } from 'express';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Require authentication for all accounts endpoints
router.use(authenticateUser);

// GET /api/accounts — returns only the logged-in user's accounts
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, balance::INT FROM accounts WHERE user_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [req.userId]
    );

    res.json({ accounts: rows });
  } catch (err) {
    console.error('[GET /api/accounts] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve accounts.' });
  }
});

// GET /api/accounts/recipients — returns accounts of OTHER users for transfers
router.get('/recipients', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.name AS account_name, u.name AS owner_name
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      WHERE a.user_id != $1 AND a.deleted_at IS NULL
      ORDER BY u.name ASC, a.name ASC
    `, [req.userId]);

    res.json({ recipients: rows });
  } catch (err) {
    console.error('[GET /api/accounts/recipients] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve transfer recipients.' });
  }
});

export default router;
