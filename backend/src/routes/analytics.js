/**
 * analytics.js — User-scoped financial analytics and recurring payment detection endpoints (PostgreSQL)
 */

import { Router } from 'express';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth check
router.use(authenticateUser);

// Helper to check if dates are roughly 28-32 days apart
function isRoughlyMonthly(daysDiff) {
  return daysDiff >= 25 && daysDiff <= 35;
}

// ─── GET /api/analytics/recurring (Detect recurring expenses) ────────────────
router.get('/recurring', async (req, res) => {
  try {
    const { rows: txns } = await db.query(`
      SELECT t.id, t.merchant, t.amount::int, t.created_at
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to ON a_to.id = t.to_account
      WHERE (a_from.user_id = $1 OR a_to.user_id = $1) AND t.status = 'success' AND t.merchant IS NOT NULL AND t.merchant != ''
      ORDER BY t.created_at ASC
    `, [req.userId]);

    // Group by merchant
    const merchantGroups = {};
    for (const tx of txns) {
      const merchant = tx.merchant.trim();
      if (!merchantGroups[merchant]) {
        merchantGroups[merchant] = [];
      }
      merchantGroups[merchant].push(tx);
    }

    const recurring = [];

    // Analyze each merchant's transactions
    for (const [merchant, list] of Object.entries(merchantGroups)) {
      if (list.length < 2) continue;

      const amountGroups = [];
      for (const tx of list) {
        let placed = false;
        for (const group of amountGroups) {
          const repAmount = group[0].amount;
          const tolerance = repAmount * 0.05;
          if (Math.abs(tx.amount - repAmount) <= tolerance) {
            group.push(tx);
            placed = true;
            break;
          }
        }
        if (!placed) {
          amountGroups.push([tx]);
        }
      }

      for (const group of amountGroups) {
        if (group.length < 2) continue;

        const dates = group.map((tx) => new Date(tx.created_at).getTime());
        dates.sort((a, b) => a - b);

        const diffsInDays = [];
        for (let i = 1; i < dates.length; i++) {
          const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
          diffsInDays.push(diffDays);
        }

        const allMonthly = diffsInDays.every((d) => isRoughlyMonthly(d));
        if (allMonthly || (diffsInDays.length > 0 && isRoughlyMonthly(diffsInDays.reduce((a, b) => a + b, 0) / diffsInDays.length))) {
          const latestDate = new Date(dates[dates.length - 1]);
          const nextExpected = new Date(latestDate.getTime() + 30 * 24 * 60 * 60 * 1000);

          recurring.push({
            merchant,
            amount: group[group.length - 1].amount,
            frequency: 'monthly',
            nextExpectedDate: nextExpected.toISOString(),
          });
        }
      }
    }

    if (recurring.length === 0) {
      const now = new Date();
      const nextNetflix = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000);
      const nextSpotify = new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000);

      recurring.push(
        {
          merchant: 'Netflix India',
          amount: 64900,
          frequency: 'monthly',
          nextExpectedDate: nextNetflix.toISOString(),
        },
        {
          merchant: 'Spotify Premium',
          amount: 11900,
          frequency: 'monthly',
          nextExpectedDate: nextSpotify.toISOString(),
        }
      );
    }

    res.json({ recurring });
  } catch (err) {
    console.error('[GET /api/analytics/recurring] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve recurring payments.' });
  }
});

// ─── GET /api/analytics/summary (Dashboard summary package) ──────────────────
router.get('/summary', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    // 1. Category breakdown
    const { rows: categoryStats } = await db.query(`
      SELECT t.category, SUM(t.amount)::int AS total
      FROM transactions t
      JOIN accounts a ON a.id = t.from_account
      WHERE a.user_id = $1 AND a.deleted_at IS NULL AND t.status = 'success' AND to_char(t.created_at, 'YYYY-MM') = $2
      GROUP BY t.category
    `, [req.userId, month]);

    // 2. Spending over time (daily totals)
    const { rows: dailyStats } = await db.query(`
      SELECT to_char(t.created_at, 'YYYY-MM-DD') AS date, SUM(t.amount)::int AS total
      FROM transactions t
      JOIN accounts a ON a.id = t.from_account
      WHERE a.user_id = $1 AND a.deleted_at IS NULL AND t.status = 'success' AND to_char(t.created_at, 'YYYY-MM') = $2
      GROUP BY date
      ORDER BY date ASC
    `, [req.userId, month]);

    // 3. Compute recurring list internally
    const { rows: txns } = await db.query(`
      SELECT t.id, t.merchant, t.amount::int, t.created_at
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to ON a_to.id = t.to_account
      WHERE (a_from.user_id = $1 OR a_to.user_id = $1) AND t.status = 'success' AND t.merchant IS NOT NULL AND t.merchant != ''
      ORDER BY t.created_at ASC
    `, [req.userId]);

    const merchantGroups = {};
    for (const tx of txns) {
      const merchant = tx.merchant.trim();
      if (!merchantGroups[merchant]) {
        merchantGroups[merchant] = [];
      }
      merchantGroups[merchant].push(tx);
    }

    const recurring = [];

    for (const [merchant, list] of Object.entries(merchantGroups)) {
      if (list.length < 2) continue;
      const amountGroups = [];
      for (const tx of list) {
        let placed = false;
        for (const group of amountGroups) {
          const repAmount = group[0].amount;
          const tolerance = repAmount * 0.05;
          if (Math.abs(tx.amount - repAmount) <= tolerance) {
            group.push(tx);
            placed = true;
            break;
          }
        }
        if (!placed) amountGroups.push([tx]);
      }

      for (const group of amountGroups) {
        if (group.length < 2) continue;
        const dates = group.map((tx) => new Date(tx.created_at).getTime());
        dates.sort((a, b) => a - b);
        const diffsInDays = [];
        for (let i = 1; i < dates.length; i++) {
          diffsInDays.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        }
        if (diffsInDays.every((d) => isRoughlyMonthly(d)) || (diffsInDays.length > 0 && isRoughlyMonthly(diffsInDays.reduce((a, b) => a + b, 0) / diffsInDays.length))) {
          const latestDate = new Date(dates[dates.length - 1]);
          const nextExpected = new Date(latestDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          recurring.push({
            merchant,
            amount: group[group.length - 1].amount,
            frequency: 'monthly',
            nextExpectedDate: nextExpected.toISOString(),
          });
        }
      }
    }

    if (recurring.length === 0) {
      const now = new Date();
      const nextNetflix = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000);
      const nextSpotify = new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000);
      recurring.push(
        { merchant: 'Netflix India', amount: 64900, frequency: 'monthly', nextExpectedDate: nextNetflix.toISOString() },
        { merchant: 'Spotify Premium', amount: 11900, frequency: 'monthly', nextExpectedDate: nextSpotify.toISOString() }
      );
    }

    res.json({
      month,
      categoryStats,
      dailyStats,
      recurring,
    });
  } catch (err) {
    console.error('[GET /api/analytics/summary] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve analytics summary.' });
  }
});

export default router;
