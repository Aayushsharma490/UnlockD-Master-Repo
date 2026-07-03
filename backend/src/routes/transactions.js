/**
 * transactions.js — User-scoped, atomic transfer router with budget hooks
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth check
router.use(authenticateUser);

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Uncategorized'];

// ─── GET /api/transactions ──────────────────────────────────────────────────
// Returns history scoped to accounts owned by the authenticated user.
router.get('/', (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT
        t.id,
        t.from_account,
        t.to_account,
        a_from.name AS from_name,
        a_to.name   AS to_name,
        t.amount,
        t.status,
        t.category,
        t.note,
        t.created_at,
        t.idempotency_key
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to   ON a_to.id   = t.to_account
      WHERE a_from.user_id = ? OR a_to.user_id = ?
      ORDER BY t.created_at DESC
    `).all(req.userId, req.userId);

    res.json({ transactions });
  } catch (err) {
    console.error('[GET /api/transactions] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve transaction history.' });
  }
});

// ─── POST /api/transactions ─────────────────────────────────────────────────
// Executes an atomic transfer between two accounts, verified under req.userId.
router.post('/', (req, res) => {
  const { from_account, to_account, amount, category = 'Uncategorized', note, idempotency_key } = req.body;

  // 1. Inputs validation
  if (!from_account || !to_account || !amount || !idempotency_key) {
    return res.status(400).json({
      error: 'Missing required fields: from_account, to_account, amount, idempotency_key',
    });
  }

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer (in paise).' });
  }

  if (from_account === to_account) {
    return res.status(400).json({ error: 'Source and destination accounts must differ.' });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
  }

  // 2. Tenant Ownership Verification
  const ownSenderAccount = db.prepare(`
    SELECT id FROM accounts WHERE id = ? AND user_id = ?
  `).get(from_account, req.userId);

  if (!ownSenderAccount) {
    return res.status(403).json({ error: 'Unauthorized: You do not own the source account.' });
  }

  // 3. Idempotency Check
  const existing = db.prepare(`
    SELECT t.*, a_from.name AS from_name, a_to.name AS to_name
    FROM transactions t
    JOIN accounts a_from ON a_from.id = t.from_account
    JOIN accounts a_to   ON a_to.id   = t.to_account
    WHERE t.idempotency_key = ?
  `).get(idempotency_key);

  if (existing) {
    console.log(`[POST /api/transactions] Deduped request — key: ${idempotency_key}`);
    
    // Check if there is an active budget to report on deduped request
    let budgetAlert = null;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const budget = db.prepare('SELECT limit_amount FROM budgets WHERE user_id = ? AND category = ? AND month = ?').get(req.userId, category, currentMonth);
      
      if (budget && budget.limit_amount > 0) {
        const spentStats = db.prepare(`
          SELECT COALESCE(SUM(t.amount), 0) AS total_spent
          FROM transactions t
          JOIN accounts a ON a.id = t.from_account
          WHERE a.user_id = ? AND t.category = ? AND t.status = 'success' AND strftime('%Y-%m', t.created_at) = ?
        `).get(req.userId, category, currentMonth);
        
        const spent = spentStats?.total_spent || 0;
        budgetAlert = {
          category,
          spent,
          limit_amount: budget.limit_amount,
          percentUsed: Number(((spent / budget.limit_amount) * 100).toFixed(1)),
        };
      }
    } catch (_) {}

    return res.status(200).json({
      deduplicated: true,
      transaction: existing,
      budgetAlert,
    });
  }

  // 4. Atomic Transfer execution
  const performTransfer = db.transaction(() => {
    // Read accounts inside the lock block
    const sender = db.prepare('SELECT id, name, balance FROM accounts WHERE id = ?').get(from_account);
    const receiver = db.prepare('SELECT id, name, balance FROM accounts WHERE id = ?').get(to_account);

    if (!sender) throw { code: 'ACCOUNT_NOT_FOUND', account: from_account };
    if (!receiver) throw { code: 'ACCOUNT_NOT_FOUND', account: to_account };

    if (sender.balance < amount) {
      throw { code: 'INSUFFICIENT_FUNDS', available: sender.balance, requested: amount };
    }

    const txnId = 'tx_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const createdAt = new Date().toISOString();

    // Debit sender
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, from_account);

    // Credit receiver
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, to_account);

    // Insert history record
    db.prepare(`
      INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, created_at)
      VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?)
    `).run(txnId, idempotency_key, from_account, to_account, amount, category, note || null, createdAt);

    return {
      id: txnId,
      from_account,
      to_account,
      from_name: sender.name,
      to_name: receiver.name,
      amount,
      status: 'success',
      category,
      note: note || null,
      created_at: createdAt,
      from_balance_after: sender.balance - amount,
      to_balance_after: receiver.balance + amount,
    };
  });

  try {
    const result = performTransfer();

    // Check budget limit alert
    let budgetAlert = null;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const budget = db.prepare('SELECT limit_amount FROM budgets WHERE user_id = ? AND category = ? AND month = ?').get(req.userId, category, currentMonth);
      
      if (budget && budget.limit_amount > 0) {
        const spentStats = db.prepare(`
          SELECT COALESCE(SUM(t.amount), 0) AS total_spent
          FROM transactions t
          JOIN accounts a ON a.id = t.from_account
          WHERE a.user_id = ? AND t.category = ? AND t.status = 'success' AND strftime('%Y-%m', t.created_at) = ?
        `).get(req.userId, category, currentMonth);
        
        const spent = spentStats?.total_spent || 0;
        budgetAlert = {
          category,
          spent,
          limit_amount: budget.limit_amount,
          percentUsed: Number(((spent / budget.limit_amount) * 100).toFixed(1)),
        };
      }
    } catch (budgetErr) {
      console.warn('[Transactions Router] Budget computation failed:', budgetErr.message);
    }

    return res.status(201).json({
      transaction: result,
      budgetAlert,
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FUNDS') {
      const failedTxnId = 'tx_' + uuidv4().replace(/-/g, '').slice(0, 16);
      const createdAt = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, created_at)
          VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)
        `).run(failedTxnId, idempotency_key, from_account, to_account, amount, category, note || null, createdAt);
      } catch (_) {}

      return res.status(400).json({
        error: 'Insufficient funds',
        code: 'INSUFFICIENT_FUNDS',
        available: err.available,
        requested: err.requested,
        transaction: {
          id: failedTxnId,
          from_account,
          to_account,
          amount,
          status: 'failed',
          category,
          note: note || null,
          created_at: createdAt,
        },
      });
    }

    if (err.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({ error: `Account not found: ${err.account}` });
    }

    console.error('[POST /api/transactions] Internal Transfer Error:', err);
    return res.status(500).json({ error: 'Transfer failed due to internal database error.' });
  }
});

export default router;
