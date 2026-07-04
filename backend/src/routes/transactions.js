/**
 * transactions.js — User-scoped, atomic transfer router with dynamic filters, CSV export, and inline PATCH updates (PostgreSQL)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createRequire } from 'module';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';
import { parse } from 'csv-parse/sync';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// Ensure multer upload directory exists
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

const router = Router();
router.use(authenticateUser);

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Uncategorized'];

// Compatibility helper to convert SQLite '?' placeholders to Postgres '$1', '$2', etc.
function convertSqlPlaceholders(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

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
    t.amount::int,
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
    query += ` AND (t.description ILIKE ? OR t.merchant ILIKE ? OR t.note ILIKE ?)`;
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
    const d = new Date(req.query.dateTo);
    d.setHours(23, 59, 59, 999);
    query += ` AND t.created_at <= ?`;
    params.push(d.toISOString());
  }

  return { query, params };
}

// ─── GET /api/transactions (Paginated, Searchable, Filterable) ──────────────
router.get('/', async (req, res) => {
  try {
    const { query: countQuery, params: countParams } = buildFilterQuery(req, req.userId, true);
    const countResult = await db.query(convertSqlPlaceholders(countQuery), countParams);
    const count = parseInt(countResult.rows[0]?.count || '0', 10);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    let { query: selectQuery, params: selectParams } = buildFilterQuery(req, req.userId, false);
    selectQuery += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    selectParams.push(limit, offset);

    const { rows: transactions } = await db.query(convertSqlPlaceholders(selectQuery), selectParams);

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

// ─── GET /api/transactions/export (Streamed CSV) ─────────────────────────────
router.get('/export', async (req, res) => {
  try {
    let { query, params } = buildFilterQuery(req, req.userId, false);
    query += ` ORDER BY t.created_at DESC`;

    const { rows: transactions } = await db.query(convertSqlPlaceholders(query), params);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');

    // Stream headers
    res.write('Date,Description,Merchant,Category,Account,Amount,Status\n');

    for (const tx of transactions) {
      const date = tx.created_at ? new Date(tx.created_at).toISOString().slice(0, 10) : '';
      const desc = (tx.description || tx.note || '').replace(/"/g, '""');
      const merchant = (tx.merchant || '').replace(/"/g, '""');
      const cat = tx.category || 'Uncategorized';
      const account = `${tx.from_name} ➔ ${tx.to_name}`;

      const isOutflow = tx.from_user_id === req.userId;
      const signedAmt = (isOutflow ? -tx.amount : tx.amount) / 100;

      res.write(`"${date}","${desc}","${merchant}","${cat}","${account}",${signedAmt.toFixed(2)},"${tx.status}"\n`);
    }

    res.end();
  } catch (err) {
    console.error('[GET /api/transactions/export] Error:', err);
    res.status(500).send('Failed to export transactions.');
  }
});

// ─── PATCH /api/transactions/:id (Inline Edit) ──────────────────────────────
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { description, merchant, category } = req.body;

  try {
    const { rows } = await db.query(`
      SELECT t.*
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to ON a_to.id = t.to_account
      WHERE t.id = $1 AND (a_from.user_id = $2 OR a_to.user_id = $2)
    `, [id, req.userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or unauthorized.' });
    }
    const txn = rows[0];

    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
    }

    const updatedDesc = description !== undefined ? description : txn.description;
    const updatedMerch = merchant !== undefined ? merchant : txn.merchant;
    const updatedCat = category !== undefined ? category : txn.category;

    await db.query(`
      UPDATE transactions
      SET description = $1, merchant = $2, category = $3
      WHERE id = $4
    `, [updatedDesc, updatedMerch, updatedCat, id]);

    const updatedTxnResult = await db.query(`
      SELECT
        t.id,
        t.from_account,
        t.to_account,
        a_from.name AS from_name,
        a_to.name   AS to_name,
        t.amount::int,
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
      WHERE t.id = $1
    `, [id]);

    res.json({ transaction: updatedTxnResult.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/transactions/:id] Error:', err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// Reusable atomic transfer engine
export async function executeTransfer(client, { from_account, to_account, amount, category, note, description, merchant, idempotency_key, userId }) {
  const senderResult = await client.query('SELECT id, name, balance::int, user_id, deleted_at FROM accounts WHERE id = $1 FOR UPDATE', [from_account]);
  const receiverResult = await client.query('SELECT id, name, balance::int, user_id, deleted_at FROM accounts WHERE id = $2 FOR UPDATE', [to_account]);

  if (senderResult.rows.length === 0 || senderResult.rows[0].deleted_at !== null) {
    throw { code: 'INACTIVE_ACCOUNT', account: from_account };
  }
  if (receiverResult.rows.length === 0 || receiverResult.rows[0].deleted_at !== null) {
    throw { code: 'INACTIVE_ACCOUNT', account: to_account };
  }

  const sender = senderResult.rows[0];
  const receiver = receiverResult.rows[0];

  if (sender.user_id !== userId) {
    throw { code: 'UNAUTHORIZED_SENDER' };
  }

  if (sender.balance < amount) {
    throw { code: 'INSUFFICIENT_FUNDS', available: sender.balance, requested: amount };
  }

  const txnId = 'tx_' + uuidv4().replace(/-/g, '').slice(0, 16);
  const createdAt = new Date();

  // Debit sender
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, from_account]);

  // Credit receiver
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, to_account]);

  // Insert history record
  await client.query(`
    INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
    VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, $10)
  `, [txnId, idempotency_key, from_account, to_account, amount, category, note || null, description || null, merchant || null, createdAt]);

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
    created_at: createdAt.toISOString(),
    from_balance_after: sender.balance - amount,
    to_balance_after: receiver.balance + amount,
  };
}

// ─── POST /api/transactions (Atomic Transfer execution) ─────────────────────
router.post('/', async (req, res) => {
  const { from_account, to_account, amount, category = 'Uncategorized', note, description, merchant, idempotency_key } = req.body;

  if (!from_account || !to_account || !amount || !idempotency_key) {
    return res.status(400).json({
      error: 'Missing required fields: from_account, to_account, amount, idempotency_key',
    });
  }

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer (in paise).' });
  }

  if (from_account === to_account) {
    return res.status(400).json({ error: 'Source and destination accounts must differ.', code: 'INVALID_TRANSFER' });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
  }

  // Idempotency Check
  try {
    const existingResult = await db.query(`
      SELECT t.*, a_from.name AS from_name, a_to.name AS to_name
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to   ON a_to.id   = t.to_account
      WHERE t.idempotency_key = $1
    `, [idempotency_key]);

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      let budgetAlert = null;
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { rows: budgets } = await db.query('SELECT limit_amount::int FROM budgets WHERE user_id = $1 AND category = $2 AND month = $3 AND deleted_at IS NULL', [req.userId, category, currentMonth]);
        
        if (budgets.length > 0 && budgets[0].limit_amount > 0) {
          const limitAmount = budgets[0].limit_amount;
          const spentStats = await db.query(`
            SELECT COALESCE(SUM(t.amount), 0)::int AS total_spent
            FROM transactions t
            JOIN accounts a ON a.id = t.from_account
            WHERE a.user_id = $1 AND a.deleted_at IS NULL AND t.category = $2 AND t.status = 'success' AND to_char(t.created_at, 'YYYY-MM') = $3
          `, [req.userId, category, currentMonth]);
          
          const spent = spentStats.rows[0]?.total_spent || 0;
          budgetAlert = {
            category,
            spent,
            limit_amount: limitAmount,
            percentUsed: Number(((spent / limitAmount) * 100).toFixed(1)),
          };
        }
      } catch (_) {}

      return res.status(200).json({
        deduplicated: true,
        transaction: existing,
        budgetAlert,
      });
    }
  } catch (err) {
    console.error('Idempotency query error:', err);
  }

  // Daily Transfer Limit check (₹5,00,000/day = 50000000 paise)
  try {
    const totalTodayResult = await db.query(`
      SELECT COALESCE(SUM(t.amount), 0)::int AS total_today
      FROM transactions t
      JOIN accounts a_from ON a_from.id = t.from_account
      JOIN accounts a_to   ON a_to.id   = t.to_account
      WHERE a_from.user_id = $1 
        AND a_to.user_id != $1
        AND t.status = 'success'
        AND t.created_at >= NOW() - INTERVAL '24 hours'
    `, [req.userId]);

    const totalToday = totalTodayResult.rows[0].total_today;
    if (totalToday + amount > 50000000) {
      return res.status(400).json({
        error: `Transfer failed: Exceeds the daily transfer limit of ₹5,00,000. You have already transferred ₹${(totalToday / 100).toLocaleString('en-IN')} in the last 24 hours.`,
        code: 'DAILY_LIMIT_EXCEEDED'
      });
    }
  } catch (limitErr) {
    console.error('Daily limit verify error:', limitErr);
  }

  // Execute Transfer inside pool client transaction
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await executeTransfer(client, {
      from_account,
      to_account,
      amount,
      category,
      note,
      description,
      merchant,
      idempotency_key,
      userId: req.userId,
    });
    await client.query('COMMIT');

    // Check budget limit alert
    let budgetAlert = null;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { rows: budgets } = await db.query('SELECT limit_amount::int FROM budgets WHERE user_id = $1 AND category = $2 AND month = $3 AND deleted_at IS NULL', [req.userId, category, currentMonth]);
      
      if (budgets.length > 0 && budgets[0].limit_amount > 0) {
        const limitAmount = budgets[0].limit_amount;
        const spentStats = await db.query(`
          SELECT COALESCE(SUM(t.amount), 0)::int AS total_spent
          FROM transactions t
          JOIN accounts a ON a.id = t.from_account
          WHERE a.user_id = $1 AND a.deleted_at IS NULL AND t.category = $2 AND t.status = 'success' AND to_char(t.created_at, 'YYYY-MM') = $3
        `, [req.userId, category, currentMonth]);
        
        const spent = spentStats.rows[0]?.total_spent || 0;
        budgetAlert = {
          category,
          spent,
          limit_amount: limitAmount,
          percentUsed: Number(((spent / limitAmount) * 100).toFixed(1)),
        };
      }
    } catch (_) {}

    return res.status(201).json({
      transaction: result,
      budgetAlert,
    });
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === 'INSUFFICIENT_FUNDS') {
      const failedTxnId = 'tx_' + uuidv4().replace(/-/g, '').slice(0, 16);
      const createdAt = new Date();
      try {
        await db.query(`
          INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
          VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8, $9, $10)
        `, [failedTxnId, idempotency_key, from_account, to_account, amount, category, note || null, description || null, merchant || null, createdAt]);
      } catch (_) {}

      return res.status(400).json({
        error: 'Insufficient funds in the source account.',
        code: 'INSUFFICIENT_FUNDS',
        available: err.available,
        requested: err.requested,
      });
    }

    if (err.code === 'INACTIVE_ACCOUNT') {
      return res.status(400).json({
        error: `Transfer failed: The account ${err.account === from_account ? 'Source' : 'Destination'} is inactive or soft-deleted.`,
        code: 'INACTIVE_ACCOUNT'
      });
    }

    if (err.code === 'UNAUTHORIZED_SENDER') {
      return res.status(403).json({ error: 'Unauthorized: You do not own the source account.', code: 'UNAUTHORIZED_SENDER' });
    }

    console.error('[POST /api/transactions] Internal Transfer Error:', err);
    return res.status(500).json({ error: 'Transfer failed due to internal database error.' });
  } finally {
    client.release();
  }
});

// ─── POST /api/transactions/import (CSV/PDF statement uploads) ───────────────
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname.toLowerCase();
  let parsedRows = [];

  try {
    if (fileName.endsWith('.csv')) {
      const fileBuffer = fs.readFileSync(filePath);
      const text = fileBuffer.toString('utf-8');
      const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });

      for (const record of records) {
        let dateVal = new Date().toISOString();
        let description = 'Imported Transaction';
        let merchant = 'External Merchant';
        let amountVal = 0;

        for (const [key, value] of Object.entries(record)) {
          const normKey = key.toLowerCase();
          const normVal = (value || '').trim();

          if (normKey.includes('date')) {
            const parsedDate = new Date(normVal);
            if (!isNaN(parsedDate.getTime())) dateVal = parsedDate.toISOString();
          } else if (normKey.includes('desc') || normKey.includes('note') || normKey.includes('memo') || normKey.includes('payee') || normKey.includes('name')) {
            description = normVal || description;
          } else if (normKey.includes('merch') || normKey.includes('shop') || normKey.includes('vendor')) {
            merchant = normVal || merchant;
          } else if (normKey.includes('amount') || normKey.includes('value') || normKey.includes('sum') || normKey.includes('price')) {
            const cleaned = normVal.replace(/[^0-9.-]/g, '');
            const parsedAmt = parseFloat(cleaned);
            if (!isNaN(parsedAmt)) amountVal = parsedAmt;
          }
        }

        if (amountVal > 0) {
          parsedRows.push({
            date: dateVal,
            description,
            merchant,
            amount: amountVal,
          });
        }
      }
    } else if (fileName.endsWith('.pdf')) {
      const fileBuffer = fs.readFileSync(filePath);
      const data = await pdf(fileBuffer);
      const text = data.text;
      const lines = text.split('\n');

      const dateRegex = /(\d{2}[-/.]\d{2}[-/.]\d{4})|(\d{4}[-/.]\d{2}[-/.]\d{2})/;
      const amountRegex = /(?:INR|Rs\.?|₹)?\s*(-?\d+(?:\.\d{2})?)/;

      for (const line of lines) {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
          const dateStr = dateMatch[0];
          const lineWithoutDate = line.replace(dateStr, '');
          const amountMatch = lineWithoutDate.match(amountRegex);
          if (amountMatch) {
            const amountVal = parseFloat(amountMatch[1]);
            if (!isNaN(amountVal) && amountVal > 0) {
              const desc = lineWithoutDate.replace(amountMatch[0], '').trim() || 'Imported Transaction';
              const words = desc.split(/\s+/);
              const merch = words.slice(0, 3).join(' ');

              parsedRows.push({
                date: new Date(dateStr).toISOString(),
                description: desc,
                merchant: merch || 'External Merchant',
                amount: amountVal,
              });
            }
          }
        }
      }
    } else {
      // Cleanup file first
      try { await fs.promises.unlink(filePath); } catch (_) {}
      return res.status(400).json({ error: 'Unsupported file format. Please upload a CSV or PDF file.' });
    }

    // Cleanup uploaded file from disk after reading it
    try { await fs.promises.unlink(filePath); } catch (_) {}

    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'No valid transactions found in the file.' });
    }

    // Ensure external merchant account exists
    const extAccountResult = await db.query('SELECT id FROM accounts WHERE id = $1', ['acc_ext_imported']);
    if (extAccountResult.rows.length === 0) {
      await db.query(`
        INSERT INTO accounts (id, name, balance, user_id)
        VALUES ('acc_ext_imported', 'External Merchant', 0, 'usr_priya')
      `);
    }

    const checkingResult = await db.query("SELECT id FROM accounts WHERE user_id = $1 AND name = 'Checking' AND deleted_at IS NULL", [req.userId]);
    const targetAccountId = checkingResult.rows.length > 0 ? checkingResult.rows[0].id : `acc_chk_${req.userId.replace('usr_', '')}`;

    let imported = 0;
    let categorized = 0;
    let uncategorized = 0;

    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      for (const row of parsedRows) {
        const amountPaise = Math.round(row.amount * 100);
        const textToMatch = `${row.description} ${row.merchant}`.toLowerCase();

        let category = 'Uncategorized';
        if (textToMatch.includes('zomato') || textToMatch.includes('swiggy') || textToMatch.includes('starbucks') || textToMatch.includes('mcdonald') || textToMatch.includes('social') || textToMatch.includes('restaurant') || textToMatch.includes('food') || textToMatch.includes('cafe') || textToMatch.includes('dining')) {
          category = 'Food';
        } else if (textToMatch.includes('uber') || textToMatch.includes('ola') || textToMatch.includes('rapido') || textToMatch.includes('metro') || textToMatch.includes('irctc') || textToMatch.includes('cab') || textToMatch.includes('auto') || textToMatch.includes('travel')) {
          category = 'Transport';
        } else if (textToMatch.includes('amazon') || textToMatch.includes('flipkart') || textToMatch.includes('myntra') || textToMatch.includes('zara') || textToMatch.includes('reliance') || textToMatch.includes('shopper') || textToMatch.includes('mall') || textToMatch.includes('retail')) {
          category = 'Shopping';
        } else if (textToMatch.includes('electricity') || textToMatch.includes('mobile') || textToMatch.includes('jio') || textToMatch.includes('airtel') || textToMatch.includes('broadband') || textToMatch.includes('rent') || textToMatch.includes('insurance') || textToMatch.includes('recharge')) {
          category = 'Bills';
        } else if (textToMatch.includes('netflix') || textToMatch.includes('spotify') || textToMatch.includes('movie') || textToMatch.includes('bookmyshow') || textToMatch.includes('theater') || textToMatch.includes('game') || textToMatch.includes('fun')) {
          category = 'Entertainment';
        }

        if (category === 'Uncategorized') {
          uncategorized++;
        } else {
          categorized++;
        }

        const txnId = 'tx_imp_' + uuidv4().replace(/-/g, '').slice(0, 16);
        const ikey = 'ikey_imp_' + uuidv4().replace(/-/g, '').slice(0, 16);

        let transactionDate = new Date();
        if (row.date) {
          const parsed = new Date(row.date);
          if (!isNaN(parsed.getTime())) {
            const now = new Date();
            parsed.setFullYear(now.getFullYear());
            parsed.setMonth(now.getMonth());
            transactionDate = parsed;
          }
        }

        await client.query(`
          INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, source, created_at)
          VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, 'imported', $10)
        `, [
          txnId,
          ikey,
          targetAccountId,
          'acc_ext_imported',
          amountPaise,
          category,
          'CSV/PDF Import',
          row.description,
          row.merchant,
          transactionDate
        ]);
        imported++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error inserting imported transactions:', err);
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      imported,
      categorized,
      uncategorized,
    });
  } catch (err) {
    // Ensure file gets deleted on catch block
    try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch (_) {}
    console.error('[POST /api/transactions/import] Error:', err);
    res.status(500).json({ error: 'Failed to parse file. Make sure columns match Date, Description, and Amount.' });
  }
});

export default router;
