/**
 * transactions.js — User-scoped, atomic transfer router with dynamic filters, CSV export, and inline PATCH updates.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth check
router.use(authenticateUser);

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Uncategorized'];

// Helper to construct dynamic WHERE clauses and query parameters
function buildFilterQuery(req, userId, isCount = false) {
  let selectClause = `
    t.id,
    t.from_account,
    t.to_account,
    a_from.name AS from_name,
    a_to.name   AS to_name,
    a_from.user_id AS from_user_id,
    a_to.user_id   AS to_user_id,
    t.amount,
    t.status,
    t.category,
    t.note,
    t.description,
    t.merchant,
    t.created_at,
    t.idempotency_key
  `;
  if (isCount) {
    selectClause = `COUNT(*) AS count`;
  }

  let query = `
    SELECT ${selectClause}
    FROM transactions t
    JOIN accounts a_from ON a_from.id = t.from_account
    JOIN accounts a_to   ON a_to.id   = t.to_account
    WHERE (a_from.user_id = ? OR a_to.user_id = ?)
  `;
  const params = [userId, userId];

  if (req.query.search) {
    query += ` AND (t.description LIKE ? OR t.merchant LIKE ? OR t.note LIKE ?)`;
    const pattern = `%${req.query.search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (req.query.category) {
    query += ` AND t.category = ?`;
    params.push(req.query.category);
  }

  if (req.query.account) {
    query += ` AND (t.from_account = ? OR t.to_account = ?)`;
    params.push(req.query.account, req.query.account);
  }

  if (req.query.minAmount) {
    const minPaise = Math.round(parseFloat(req.query.minAmount) * 100);
    if (!isNaN(minPaise)) {
      query += ` AND t.amount >= ?`;
      params.push(minPaise);
    }
  }
  if (req.query.maxAmount) {
    const maxPaise = Math.round(parseFloat(req.query.maxAmount) * 100);
    if (!isNaN(maxPaise)) {
      query += ` AND t.amount <= ?`;
      params.push(maxPaise);
    }
  }

  if (req.query.dateFrom) {
    query += ` AND t.created_at >= ?`;
    params.push(new Date(req.query.dateFrom).toISOString());
  }
  if (req.query.dateTo) {
    // Include the entire day up to 23:59:59.999
    const d = new Date(req.query.dateTo);
    d.setHours(23, 59, 59, 999);
    query += ` AND t.created_at <= ?`;
    params.push(d.toISOString());
  }

  return { query, params };
}

// ─── GET /api/transactions (Paginated, Searchable, Filterable) ──────────────
router.get('/', (req, res) => {
  try {
    const { query: countQuery, params: countParams } = buildFilterQuery(req, req.userId, true);
    const { count } = db.prepare(countQuery).get(...countParams);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    let { query: selectQuery, params: selectParams } = buildFilterQuery(req, req.userId, false);
    selectQuery += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    selectParams.push(limit, offset);

    const transactions = db.prepare(selectQuery).all(...selectParams);

    res.json({
      transactions,
      page,
      limit,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('[GET /api/transactions] Error:', err);
    res.status(500).json({ error: 'Failed to retrieve transaction history.' });
  }
});

// ─── GET /api/transactions/export (Downloadable CSV) ─────────────────────────
router.get('/export', (req, res) => {
  try {
    let { query, params } = buildFilterQuery(req, req.userId, false);
    query += ` ORDER BY t.created_at DESC`;

    const transactions = db.prepare(query).all(...params);

    // Columns: date, description, merchant, category, account, amount, status
    let csv = 'Date,Description,Merchant,Category,Account,Amount,Status\n';

    for (const tx of transactions) {
      const date = tx.created_at ? tx.created_at.slice(0, 10) : '';
      const desc = (tx.description || tx.note || '').replace(/"/g, '""');
      const merchant = (tx.merchant || '').replace(/"/g, '""');
      const cat = tx.category || 'Uncategorized';
      const account = `${tx.from_name} ➔ ${tx.to_name}`;

      // Signed amount: negative if outflow from user's account
      const isOutflow = tx.from_user_id === req.userId;
      const signedAmt = (isOutflow ? -tx.amount : tx.amount) / 100;

      csv += `"${date}","${desc}","${merchant}","${cat}","${account}",${signedAmt.toFixed(2)},"${tx.status}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.status(200).send(csv);
  } catch (err) {
    console.error('[GET /api/transactions/export] Error:', err);
    res.status(500).send('Failed to export transactions.');
  }
});

// ─── PATCH /api/transactions/:id (Inline Edit) ──────────────────────────────
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { description, merchant, category } = req.body;

  try {
    // 1. Verify ownership of the accounts in this transaction
    const txn = db.prepare(`
      SELECT t.*
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to ON a_to.id = t.to_account
      WHERE t.id = ? AND (a_from.user_id = ? OR a_to.user_id = ?)
    `).get(id, req.userId, req.userId);

    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found or unauthorized.' });
    }

    // 2. Validate category if provided
    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
    }

    // 3. Perform update
    const updatedDesc = description !== undefined ? description : txn.description;
    const updatedMerch = merchant !== undefined ? merchant : txn.merchant;
    const updatedCat = category !== undefined ? category : txn.category;

    db.prepare(`
      UPDATE transactions
      SET description = ?, merchant = ?, category = ?
      WHERE id = ?
    `).run(updatedDesc, updatedMerch, updatedCat, id);

    // Retrieve and return the updated transaction
    const updatedTxn = db.prepare(`
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
        t.description,
        t.merchant,
        t.created_at,
        t.idempotency_key
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to ON a_to.id = t.to_account
      WHERE t.id = ?
    `).get(id);

    res.json({ transaction: updatedTxn });
  } catch (err) {
    console.error('[PATCH /api/transactions/:id] Error:', err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// ─── POST /api/transactions (Atomic Transfer execution) ─────────────────────
router.post('/', (req, res) => {
  const { from_account, to_account, amount, category = 'Uncategorized', note, description, merchant, idempotency_key } = req.body;

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
      INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
      VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?)
    `).run(txnId, idempotency_key, from_account, to_account, amount, category, note || null, description || null, merchant || null, createdAt);

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
      description: description || null,
      merchant: merchant || null,
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
          INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
          VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?, ?)
        `).run(failedTxnId, idempotency_key, from_account, to_account, amount, category, note || null, description || null, merchant || null, createdAt);
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
          description: description || null,
          merchant: merchant || null,
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
