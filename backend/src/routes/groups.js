/**
 * groups.js — User-scoped Groups and Bill Splitting Router (PostgreSQL)
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser);

// Helper function to recompute optimal settlements (greedy minimum transaction algorithm)
async function calculateOptimalSettlements(groupId) {
  const { rows: members } = await db.query('SELECT id, name FROM group_members WHERE group_id = $1', [groupId]);
  
  const balances = [];
  for (const m of members) {
    const paidResult = await db.query('SELECT COALESCE(SUM(amount), 0)::int as total FROM expenses WHERE group_id = $1 AND paid_by = $2', [groupId, m.id]);
    const paid = paidResult.rows[0].total;

    const owedResult = await db.query(`
      SELECT COALESCE(SUM(es.amount_owed), 0)::int as total 
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = $1 AND es.member_id = $2
    `, [groupId, m.id]);
    const owed = owedResult.rows[0].total;
    
    const settledSentResult = await db.query("SELECT COALESCE(SUM(amount), 0)::int as total FROM settlements WHERE group_id = $1 AND from_member = $2 AND status = 'paid'", [groupId, m.id]);
    const settledSent = settledSentResult.rows[0].total;

    const settledRecvResult = await db.query("SELECT COALESCE(SUM(amount), 0)::int as total FROM settlements WHERE group_id = $1 AND to_member = $2 AND status = 'paid'", [groupId, m.id]);
    const settledRecv = settledRecvResult.rows[0].total;

    const net = (paid + settledRecv) - (owed + settledSent);
    balances.push({ member_id: m.id, name: m.name, net });
  }

  // Separate into creditors and debtors
  let creditors = balances.filter(b => b.net > 0).map(b => ({ ...b }));
  let debtors = balances.filter(b => b.net < 0).map(b => ({ ...b, net: -b.net }));

  const newSettlements = [];

  // Sort descending by net
  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => b.net - a.net);

  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    if (creditor.net === 0) {
      cIdx++;
      continue;
    }
    if (debtor.net === 0) {
      dIdx++;
      continue;
    }

    const settleAmount = Math.min(creditor.net, debtor.net);
    
    newSettlements.push({
      id: 'set_' + uuidv4().replace(/-/g, '').slice(0, 16),
      group_id: groupId,
      from_member: debtor.member_id,
      to_member: creditor.member_id,
      amount: settleAmount,
      status: 'pending',
    });

    creditor.net -= settleAmount;
    debtor.net -= settleAmount;

    if (creditor.net === 0) cIdx++;
    if (debtor.net === 0) dIdx++;
  }

  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM settlements WHERE group_id = $1 AND status = 'pending'", [groupId]);
    
    for (const s of newSettlements) {
      await client.query(`
        INSERT INTO settlements (id, group_id, from_member, to_member, amount, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
      `, [s.id, s.group_id, s.from_member, s.to_member, s.amount]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating settlements:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ── GET /api/groups ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, created_at
      FROM groups
      WHERE created_by = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `, [req.userId]);
    res.json({ groups: rows });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    res.status(500).json({ error: 'Failed to retrieve groups.' });
  }
});

// ── POST /api/groups ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, member_names } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  const groupId = 'gp_' + uuidv4().replace(/-/g, '').slice(0, 16);
  const createdAt = new Date();

  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO groups (id, name, created_by, created_at)
      VALUES ($1, $2, $3, $4)
    `, [groupId, name, req.userId, createdAt]);

    if (Array.isArray(member_names)) {
      for (const mName of member_names) {
        if (mName && mName.trim()) {
          const memId = 'gpm_' + uuidv4().replace(/-/g, '').slice(0, 16);
          await client.query('INSERT INTO group_members (id, group_id, name) VALUES ($1, $2, $3)', [memId, groupId, mName.trim()]);
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ group: { id: groupId, name, created_at: createdAt.toISOString() } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/groups]', err);
    res.status(500).json({ error: 'Failed to create group.' });
  } finally {
    client.release();
  }
});

// ── POST /api/groups/:id/members ────────────────────────────────────────────
router.post('/:id/members', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Member name is required.' });
  }

  try {
    const groupResult = await db.query('SELECT id FROM groups WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL', [req.params.id, req.userId]);
    if (groupResult.rows.length === 0) return res.status(403).json({ error: 'Unauthorized.' });

    const memId = 'gpm_' + uuidv4().replace(/-/g, '').slice(0, 16);
    await db.query('INSERT INTO group_members (id, group_id, name) VALUES ($1, $2, $3)', [memId, req.params.id, name.trim()]);

    await calculateOptimalSettlements(req.params.id);

    res.status(201).json({ member: { id: memId, name: name.trim() } });
  } catch (err) {
    console.error('[POST /api/groups/:id/members]', err);
    res.status(500).json({ error: 'Failed to add member.' });
  }
});

// ── POST /api/groups/:id/expenses ───────────────────────────────────────────
router.post('/:id/expenses', async (req, res) => {
  const { paid_by, amount, description, split_type, splits, category = 'Other' } = req.body;

  if (!paid_by || !amount || !split_type) {
    return res.status(400).json({ error: 'Missing required parameters: paid_by, amount, split_type.' });
  }

  const amountPaise = Math.round(Number(amount) * 100);
  if (isNaN(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ error: 'Amount must be positive.' });
  }

  try {
    const groupResult = await db.query('SELECT id, name FROM groups WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL', [req.params.id, req.userId]);
    if (groupResult.rows.length === 0) return res.status(403).json({ error: 'Unauthorized.' });
    const group = groupResult.rows[0];

    const { rows: members } = await db.query('SELECT id, name FROM group_members WHERE group_id = $1', [group.id]);
    const memberIds = members.map((m) => m.id);

    if (!memberIds.includes(paid_by)) {
      return res.status(400).json({ error: 'Payer must be a member of the group.' });
    }

    const expId = 'exp_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const createdAt = new Date();

    let computedSplits = [];

    if (split_type === 'equal') {
      const count = memberIds.length;
      const share = Math.floor(amountPaise / count);
      const remainder = amountPaise - share * count;

      computedSplits = memberIds.map((mId) => ({
        member_id: mId,
        amount_owed: mId === paid_by ? share + remainder : share,
      }));
    } else if (split_type === 'custom') {
      if (!Array.isArray(splits)) {
        return res.status(400).json({ error: 'Splits array is required for custom split types.' });
      }

      let sum = 0;
      for (const s of splits) {
        const sPaise = Math.round(Number(s.amount_owed) * 100);
        if (isNaN(sPaise) || sPaise < 0) {
          return res.status(400).json({ error: 'Individual split amounts must be non-negative.' });
        }
        if (!memberIds.includes(s.member_id)) {
          return res.status(400).json({ error: `Member ${s.member_id} is not in the group.` });
        }
        computedSplits.push({
          member_id: s.member_id,
          amount_owed: sPaise,
        });
        sum += sPaise;
      }

      if (sum !== amountPaise) {
        return res.status(400).json({
          error: `Splits sum (₹${(sum / 100).toFixed(2)}) must equal total expense (₹${(amountPaise / 100).toFixed(2)}).`,
        });
      }
    } else {
      return res.status(400).json({ error: 'Invalid split_type.' });
    }

    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO expenses (id, group_id, paid_by, amount, description, split_type, category, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [expId, group.id, paid_by, amountPaise, description || null, split_type, category, createdAt]);

      for (const s of computedSplits) {
        const splitId = 'spl_' + uuidv4().replace(/-/g, '').slice(0, 16);
        await client.query(`
          INSERT INTO expense_splits (id, expense_id, member_id, amount_owed)
          VALUES ($1, $2, $3, $4)
        `, [splitId, expId, s.member_id, s.amount_owed]);
      }

      // INTEGRATION: Payer's own share counts as a real transaction against their budget
      const payerName = members.find(m => m.id === paid_by)?.name;
      if (payerName) {
        const userResult = await client.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [payerName]);
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          const accResult = await client.query("SELECT id FROM accounts WHERE user_id = $1 AND name = 'Checking' AND deleted_at IS NULL", [userId]);
          
          if (accResult.rows.length > 0) {
            const payerSplit = computedSplits.find(s => s.member_id === paid_by);
            const payerShareAmount = payerSplit ? payerSplit.amount_owed : 0;

            if (payerShareAmount > 0) {
              const txId = 'tx_exp_' + uuidv4().replace(/-/g, '').slice(0, 16);
              const ikey = 'ikey_exp_' + uuidv4().replace(/-/g, '').slice(0, 16);

              await client.query(`
                INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, source, created_at)
                VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, 'app', $10)
              `, [
                txId,
                ikey,
                accResult.rows[0].id,
                'acc_ext_imported',
                payerShareAmount,
                category,
                'Group Expense Share',
                description || 'Group Expense share',
                `Group: ${group.name}`,
                createdAt
              ]);
            }
          }
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error inserting expense transaction:', err);
      throw err;
    } finally {
      client.release();
    }

    await calculateOptimalSettlements(group.id);

    res.status(201).json({ message: 'Expense added and splits recorded.' });
  } catch (err) {
    console.error('[POST /api/groups/:id/expenses]', err);
    res.status(500).json({ error: 'Failed to insert expense.' });
  }
});

// ── GET /api/groups/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const groupResult = await db.query('SELECT id, name, created_at FROM groups WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL', [req.params.id, req.userId]);
    if (groupResult.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    const group = groupResult.rows[0];

    const { rows: members } = await db.query('SELECT id, name FROM group_members WHERE group_id = $1', [group.id]);
    const { rows: expenses } = await db.query(`
      SELECT e.id, e.paid_by, gm.name AS payer_name, e.amount::int, e.description, e.split_type, e.created_at
      FROM expenses e
      JOIN group_members gm ON gm.id = e.paid_by
      WHERE e.group_id = $1
      ORDER BY e.created_at DESC
    `, [group.id]);

    const { rows: settlements } = await db.query(`
      SELECT s.id, s.from_member, gm_from.name AS from_name, s.to_member, gm_to.name AS to_name, s.amount::int, s.status, s.paid_at
      FROM settlements s
      JOIN group_members gm_from ON gm_from.id = s.from_member
      JOIN group_members gm_to   ON gm_to.id   = s.to_member
      WHERE s.group_id = $1
    `, [group.id]);

    // Compute net balances
    const memberBalances = [];
    for (const m of members) {
      const paidResult = await db.query('SELECT COALESCE(SUM(amount), 0)::int as total FROM expenses WHERE group_id = $1 AND paid_by = $2', [group.id, m.id]);
      const paid = paidResult.rows[0].total;

      const owedResult = await db.query(`
        SELECT COALESCE(SUM(es.amount_owed), 0)::int as total 
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.group_id = $1 AND es.member_id = $2
      `, [group.id, m.id]);
      const owed = owedResult.rows[0].total;

      const settledSentResult = await db.query("SELECT COALESCE(SUM(amount), 0)::int as total FROM settlements WHERE group_id = $1 AND from_member = $2 AND status = 'paid'", [group.id, m.id]);
      const settledSent = settledSentResult.rows[0].total;

      const settledRecvResult = await db.query("SELECT COALESCE(SUM(amount), 0)::int as total FROM settlements WHERE group_id = $1 AND to_member = $2 AND status = 'paid'", [group.id, m.id]);
      const settledRecv = settledRecvResult.rows[0].total;

      const net = (paid + settledRecv) - (owed + settledSent);
      memberBalances.push({
        id: m.id,
        name: m.name,
        net_balance: net,
      });
    }

    res.json({
      group,
      members: memberBalances,
      expenses,
      settlements,
    });
  } catch (err) {
    console.error('[GET /api/groups/:id]', err);
    res.status(500).json({ error: 'Failed to retrieve group details.' });
  }
});

// ── PATCH /api/settlements/:id ──────────────────────────────────────────────
router.patch('/settlements/:id', async (req, res) => {
  const { status } = req.body;
  if (status !== 'paid') {
    return res.status(400).json({ error: 'Status can only be updated to paid.' });
  }

  try {
    const settlementResult = await db.query('SELECT group_id, amount::int, from_member, to_member FROM settlements WHERE id = $1', [req.params.id]);
    if (settlementResult.rows.length === 0) return res.status(404).json({ error: 'Settlement not found.' });
    const settlement = settlementResult.rows[0];

    const groupResult = await db.query('SELECT id, name FROM groups WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL', [settlement.group_id, req.userId]);
    if (groupResult.rows.length === 0) return res.status(403).json({ error: 'Unauthorized.' });
    const group = groupResult.rows[0];

    const paidAt = new Date();

    const fromMemResult = await db.query('SELECT name FROM group_members WHERE id = $1', [settlement.from_member]);
    const toMemResult = await db.query('SELECT name FROM group_members WHERE id = $1', [settlement.to_member]);
    
    if (fromMemResult.rows.length > 0 && toMemResult.rows.length > 0) {
      const fromName = fromMemResult.rows[0].name;
      const toName = toMemResult.rows[0].name;

      const userFromResult = await db.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [fromName]);
      const userToResult = await db.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [toName]);

      if (userFromResult.rows.length > 0 && userToResult.rows.length > 0) {
        const uFrom = userFromResult.rows[0].id;
        const uTo = userToResult.rows[0].id;

        const accFromResult = await db.query("SELECT id FROM accounts WHERE user_id = $1 AND name = 'Checking' AND deleted_at IS NULL", [uFrom]);
        const accToResult = await db.query("SELECT id FROM accounts WHERE user_id = $1 AND name = 'Checking' AND deleted_at IS NULL", [uTo]);

        if (accFromResult.rows.length > 0 && accToResult.rows.length > 0) {
          const client = await db.getPool().connect();
          try {
            await client.query('BEGIN');
            await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [settlement.amount, accFromResult.rows[0].id]);
            await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [settlement.amount, accToResult.rows[0].id]);

            const txId = 'tx_set_' + uuidv4().replace(/-/g, '').slice(0, 16);
            const ikey = 'ikey_set_' + uuidv4().replace(/-/g, '').slice(0, 16);

            await client.query(`
              INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, source, created_at)
              VALUES ($1, $2, $3, $4, $5, 'success', 'Settlement', 'Group Settlement', $6, $7, 'app', $8)
            `, [
              txId,
              ikey,
              accFromResult.rows[0].id,
              accToResult.rows[0].id,
              settlement.amount,
              `Settled dues in group: ${group.name}`,
              toName,
              paidAt
            ]);
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error executing settlement transfer:', err);
            throw err;
          } finally {
            client.release();
          }
        }
      }
    }

    await db.query("UPDATE settlements SET status = 'paid', paid_at = $1 WHERE id = $2", [paidAt, req.params.id]);

    await calculateOptimalSettlements(group.id);

    res.json({ message: 'Settlement marked as paid.' });
  } catch (err) {
    console.error('[PATCH /api/settlements/:id]', err);
    res.status(500).json({ error: 'Failed to update settlement.' });
  }
});

export default router;
