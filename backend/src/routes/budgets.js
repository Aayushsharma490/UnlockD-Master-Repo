/**
 * budgets.js — Budget upsert and computed retrieval endpoints (PostgreSQL)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth protection to all endpoints
router.use(authenticateUser);

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other'];

// ── GET /api/budgets ────────────────────────────────────────────────────────
// Returns limits and computed spent statistics for a given month (YYYY-MM)
router.get('/', async (req, res) => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = req.query.month || defaultMonth;

  // Validate YYYY-MM format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month must be in YYYY-MM format.' });
  }

  try {
    // 1. Fetch user's defined budgets for this month
    const { rows: budgets } = await db.query(`
      SELECT category, limit_amount::int
      FROM budgets
      WHERE user_id = $1 AND month = $2 AND deleted_at IS NULL
    `, [req.userId, month]);

    const budgetMap = new Map(budgets.map((b) => [b.category, b.limit_amount]));

    // 2. Fetch computed spent values from transactions
    const { rows: spentStats } = await db.query(`
      SELECT t.category, COALESCE(SUM(t.amount), 0)::int AS total_spent
      FROM transactions t
      JOIN accounts a ON a.id = t.from_account
      WHERE a.user_id = $1 AND a.deleted_at IS NULL
        AND t.status = 'success'
        AND to_char(t.created_at, 'YYYY-MM') = $2
      GROUP BY t.category
    `, [req.userId, month]);

    const spentMap = new Map(spentStats.map((s) => [s.category, s.total_spent]));

    // 3. Assemble response for all allowed categories
    const budgetList = ALLOWED_CATEGORIES.map((cat) => {
      const limit = budgetMap.get(cat) || 0; // 0 means budget not configured
      const spent = spentMap.get(cat) || 0;
      const remaining = limit > 0 ? Math.max(0, limit - spent) : 0;
      const percentUsed = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;

      return {
        category: cat,
        month,
        limit_amount: limit,
        spent,
        remaining,
        percentUsed,
      };
    });

    res.json({ budgets: budgetList });
  } catch (err) {
    console.error('[GET /api/budgets] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve budgets.' });
  }
});

// ── POST /api/budgets ───────────────────────────────────────────────────────
// Create or update a budget limit
router.post('/', async (req, res) => {
  const { category, month, limit_amount } = req.body;

  if (!category || !limit_amount) {
    return res.status(400).json({ error: 'Category and limit_amount are required.' });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
  }

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || defaultMonth;

  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return res.status(400).json({ error: 'Month must be in YYYY-MM format.' });
  }

  const limitPaise = Math.round(Number(limit_amount) * 100);
  if (isNaN(limitPaise) || limitPaise <= 0) {
    return res.status(400).json({ error: 'limit_amount must be a positive number.' });
  }

  try {
    const budgetId = uuidv4();
    const createdAt = new Date();

    // Upsert using PostgreSQL INSERT ON CONFLICT
    await db.query(`
      INSERT INTO budgets (id, user_id, category, month, limit_amount, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(user_id, category, month) DO UPDATE SET
        limit_amount = EXCLUDED.limit_amount,
        created_at = EXCLUDED.created_at,
        deleted_at = NULL
    `, [budgetId, req.userId, category, targetMonth, limitPaise, createdAt]);

    // Compute live stats for the updated budget to return to frontend
    const spentStats = await db.query(`
      SELECT COALESCE(SUM(t.amount), 0)::int AS total_spent
      FROM transactions t
      JOIN accounts a ON a.id = t.from_account
      WHERE a.user_id = $1 AND a.deleted_at IS NULL
        AND t.status = 'success'
        AND t.category = $2
        AND to_char(t.created_at, 'YYYY-MM') = $3
    `, [req.userId, category, targetMonth]);

    const spent = spentStats.rows[0]?.total_spent || 0;
    const remaining = Math.max(0, limitPaise - spent);
    const percentUsed = Number(((spent / limitPaise) * 100).toFixed(1));

    res.status(200).json({
      message: 'Budget set successfully.',
      budget: {
        category,
        month: targetMonth,
        limit_amount: limitPaise,
        spent,
        remaining,
        percentUsed,
      },
    });
  } catch (err) {
    console.error('[POST /api/budgets] Error:', err);
    res.status(500).json({ error: 'Failed to configure budget.' });
  }
});

export default router;
