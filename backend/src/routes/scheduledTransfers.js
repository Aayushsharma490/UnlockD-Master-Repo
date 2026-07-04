/**
 * scheduledTransfers.js — Scheduled & Recurring Transfers Router (PostgreSQL)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser);

// ── GET /api/scheduled-transfers ────────────────────────────────────────────
// Fetch all scheduled transfers for the logged-in user
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.id, s.from_account, s.to_account, 
             a_from.name AS from_name, a_to.name AS to_name,
             s.amount::int, s.frequency, s.next_run_date, s.status, s.last_run_at, s.created_at
      FROM scheduled_transfers s
      JOIN accounts a_from ON a_from.id = s.from_account
      JOIN accounts a_to ON a_to.id = s.to_account
      WHERE s.user_id = $1 AND a_from.deleted_at IS NULL AND a_to.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `, [req.userId]);

    res.json({ scheduledTransfers: rows });
  } catch (err) {
    console.error('[GET /api/scheduled-transfers] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve scheduled transfers.' });
  }
});

// ── POST /api/scheduled-transfers ───────────────────────────────────────────
// Create a new scheduled transfer
router.post('/', async (req, res) => {
  const { from_account, to_account, amount, frequency, next_run_date } = req.body;

  if (!from_account || !to_account || !amount || !frequency || !next_run_date) {
    return res.status(400).json({ error: 'Missing required parameters: from_account, to_account, amount, frequency, next_run_date' });
  }

  const amountPaise = Math.round(Number(amount) * 100);
  if (isNaN(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ error: 'Amount must be positive.' });
  }

  if (from_account === to_account) {
    return res.status(400).json({ error: 'Source and destination accounts must differ.' });
  }

  if (!['once', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'Frequency must be one of: once, weekly, monthly' });
  }

  const runDate = new Date(next_run_date);
  if (isNaN(runDate.getTime()) || runDate.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Next run date must be a valid future date.' });
  }

  try {
    // Verify user owns the from_account
    const { rows: ownAcc } = await db.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [from_account, req.userId]);
    if (ownAcc.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: You do not own the source account.' });
    }

    // Verify to_account exists and is active
    const { rows: destAcc } = await db.query('SELECT id FROM accounts WHERE id = $1 AND deleted_at IS NULL', [to_account]);
    if (destAcc.length === 0) {
      return res.status(400).json({ error: 'Destination account is inactive or not found.' });
    }

    const scheduleId = 'sch_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const createdAt = new Date();

    await db.query(`
      INSERT INTO scheduled_transfers (id, user_id, from_account, to_account, amount, frequency, next_run_date, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
    `, [scheduleId, req.userId, from_account, to_account, amountPaise, frequency, runDate, createdAt]);

    res.status(201).json({
      message: 'Scheduled transfer created successfully.',
      scheduledTransfer: {
        id: scheduleId,
        from_account,
        to_account,
        amount: amountPaise,
        frequency,
        next_run_date: runDate.toISOString(),
        status: 'active'
      }
    });

  } catch (err) {
    console.error('[POST /api/scheduled-transfers] Error:', err);
    res.status(500).json({ error: 'Failed to create scheduled transfer.' });
  }
});

// ── PATCH /api/scheduled-transfers/:id ──────────────────────────────────────
// Update the status of a scheduled transfer (pause, resume, cancel)
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, paused, or cancelled.' });
  }

  try {
    const result = await db.query(`
      UPDATE scheduled_transfers
      SET status = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `, [status, req.params.id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled transfer not found or unauthorized.' });
    }

    res.json({
      message: `Scheduled transfer status updated to ${status}.`,
      scheduledTransfer: result.rows[0]
    });
  } catch (err) {
    console.error('[PATCH /api/scheduled-transfers/:id] Error:', err);
    res.status(500).json({ error: 'Failed to update scheduled transfer.' });
  }
});

export default router;
