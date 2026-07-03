/**
 * groups.js — User-scoped Groups and Bill Splitting Router
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser);

// Helper function to recompute optimal settlements (greedy minimum transaction algorithm)
function calculateOptimalSettlements(groupId) {
  const members = db.prepare('SELECT id, name FROM group_members WHERE group_id = ?').all(groupId);
  
  const balances = [];
  for (const m of members) {
    const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ? AND paid_by = ?').get(groupId, m.id).total;
    const owed = db.prepare(`
      SELECT COALESCE(SUM(es.amount_owed), 0) as total 
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = ? AND es.member_id = ?
    `).get(groupId, m.id).total;
    
    const settledSent = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM settlements WHERE group_id = ? AND from_member = ? AND status = 'paid'").get(groupId, m.id).total;
    const settledRecv = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM settlements WHERE group_id = ? AND to_member = ? AND status = 'paid'").get(groupId, m.id).total;

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

  // Delete old pending settlements and write new ones
  db.transaction(() => {
    db.prepare("DELETE FROM settlements WHERE group_id = ? AND status = 'pending'").run(groupId);
    const insertSettlement = db.prepare(`
      INSERT INTO settlements (id, group_id, from_member, to_member, amount, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    for (const s of newSettlements) {
      insertSettlement.run(s.id, s.group_id, s.from_member, s.to_member, s.amount);
    }
  })();
}

// ── GET /api/groups ─────────────────────────────────────────────────────────
// List all groups created by the authenticated user
router.get('/', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT id, name, created_at
      FROM groups
      WHERE created_by = ?
      ORDER BY created_at DESC
    `).all(req.userId);
    res.json({ groups });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    res.status(500).json({ error: 'Failed to retrieve groups.' });
  }
});

// ── POST /api/groups ────────────────────────────────────────────────────────
// Create new group and populate member names
router.post('/', (req, res) => {
  const { name, member_names } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  try {
    const groupId = 'gp_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const createdAt = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO groups (id, name, created_by, created_at)
        VALUES (?, ?, ?, ?)
      `).run(groupId, name, req.userId, createdAt);

      // Add default members if specified
      if (Array.isArray(member_names)) {
        const insertMem = db.prepare('INSERT INTO group_members (id, group_id, name) VALUES (?, ?, ?)');
        for (const mName of member_names) {
          if (mName && mName.trim()) {
            const memId = 'gpm_' + uuidv4().replace(/-/g, '').slice(0, 16);
            insertMem.run(memId, groupId, mName.trim());
          }
        }
      }
    })();

    res.status(201).json({ group: { id: groupId, name, created_at: createdAt } });
  } catch (err) {
    console.error('[POST /api/groups]', err);
    res.status(500).json({ error: 'Failed to create group.' });
  }
});

// ── POST /api/groups/:id/members ────────────────────────────────────────────
// Add a member to a group
router.post('/:id/members', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Member name is required.' });
  }

  try {
    // Verify user owns the group
    const group = db.prepare('SELECT id FROM groups WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!group) return res.status(403).json({ error: 'Unauthorized.' });

    const memId = 'gpm_' + uuidv4().replace(/-/g, '').slice(0, 16);
    db.prepare('INSERT INTO group_members (id, group_id, name) VALUES (?, ?, ?)').run(memId, group.id, name.trim());

    // Recompute settlements immediately
    calculateOptimalSettlements(group.id);

    res.status(201).json({ member: { id: memId, name: name.trim() } });
  } catch (err) {
    console.error('[POST /api/groups/:id/members]', err);
    res.status(500).json({ error: 'Failed to add member.' });
  }
});

// ── POST /api/groups/:id/expenses ───────────────────────────────────────────
// Create a new expense inside a group and split it
router.post('/:id/expenses', (req, res) => {
  const { paid_by, amount, description, split_type, splits } = req.body;

  if (!paid_by || !amount || !split_type) {
    return res.status(400).json({ error: 'Missing required parameters: paid_by, amount, split_type.' });
  }

  const amountPaise = Math.round(Number(amount) * 100);
  if (isNaN(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ error: 'Amount must be positive.' });
  }

  try {
    const group = db.prepare('SELECT id FROM groups WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!group) return res.status(403).json({ error: 'Unauthorized.' });

    const members = db.prepare('SELECT id FROM group_members WHERE group_id = ?').all(group.id);
    const memberIds = members.map((m) => m.id);

    if (!memberIds.includes(paid_by)) {
      return res.status(400).json({ error: 'Payer must be a member of the group.' });
    }

    const expId = 'exp_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const createdAt = new Date().toISOString();

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

    // Insert expense and splits
    db.transaction(() => {
      db.prepare(`
        INSERT INTO expenses (id, group_id, paid_by, amount, description, split_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(expId, group.id, paid_by, amountPaise, description || null, split_type, createdAt);

      const insertSplit = db.prepare('INSERT INTO expense_splits (id, expense_id, member_id, amount_owed) VALUES (?, ?, ?, ?)');
      for (const s of computedSplits) {
        const splitId = 'spl_' + uuidv4().replace(/-/g, '').slice(0, 16);
        insertSplit.run(splitId, expId, s.member_id, s.amount_owed);
      }
    })();

    // Recompute optimal settlements
    calculateOptimalSettlements(group.id);

    res.status(201).json({ message: 'Expense added and splits recorded.' });
  } catch (err) {
    console.error('[POST /api/groups/:id/expenses]', err);
    res.status(500).json({ error: 'Failed to insert expense.' });
  }
});

// ── GET /api/groups/:id ─────────────────────────────────────────────────────
// Retrieve all members, expenses, net balances, and settlements for a group
router.get('/:id', (req, res) => {
  try {
    const group = db.prepare('SELECT id, name, created_at FROM groups WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const members = db.prepare('SELECT id, name FROM group_members WHERE group_id = ?').all(group.id);
    const expenses = db.prepare(`
      SELECT e.id, e.paid_by, gm.name AS payer_name, e.amount, e.description, e.split_type, e.created_at
      FROM expenses e
      JOIN group_members gm ON gm.id = e.paid_by
      WHERE e.group_id = ?
      ORDER BY e.created_at DESC
    `).all(group.id);

    const settlements = db.prepare(`
      SELECT s.id, s.from_member, gm_from.name AS from_name, s.to_member, gm_to.name AS to_name, s.amount, s.status, s.paid_at
      FROM settlements s
      JOIN group_members gm_from ON gm_from.id = s.from_member
      JOIN group_members gm_to   ON gm_to.id   = s.to_member
      WHERE s.group_id = ?
    `).all(group.id);

    // Compute net running balances for each member
    const memberBalances = members.map((m) => {
      const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ? AND paid_by = ?').get(group.id, m.id).total;
      const owed = db.prepare(`
        SELECT COALESCE(SUM(es.amount_owed), 0) as total 
        FROM expense_splits es
        JOIN expenses e ON e.id = es.expense_id
        WHERE e.group_id = ? AND es.member_id = ?
      `).get(group.id, m.id).total;

      const settledSent = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM settlements WHERE group_id = ? AND from_member = ? AND status = 'paid'").get(group.id, m.id).total;
      const settledRecv = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM settlements WHERE group_id = ? AND to_member = ? AND status = 'paid'").get(group.id, m.id).total;

      const net = (paid + settledRecv) - (owed + settledSent);

      return {
        id: m.id,
        name: m.name,
        net_balance: net,
      };
    });

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
// Mark settlement paid
router.patch('/settlements/:id', (req, res) => {
  const { status } = req.body;
  if (status !== 'paid') {
    return res.status(400).json({ error: 'Status can only be updated to paid.' });
  }

  try {
    const settlement = db.prepare('SELECT group_id FROM settlements WHERE id = ?').get(req.params.id);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found.' });

    // Verify creator ownership
    const group = db.prepare('SELECT id FROM groups WHERE id = ? AND created_by = ?').get(settlement.group_id, req.userId);
    if (!group) return res.status(403).json({ error: 'Unauthorized.' });

    const paidAt = new Date().toISOString();
    db.prepare("UPDATE settlements SET status = 'paid', paid_at = ? WHERE id = ?").run(paidAt, req.params.id);

    // Recompute settlements immediately (paid settlements reduce net balance)
    calculateOptimalSettlements(group.id);

    res.json({ message: 'Settlement marked as paid.' });
  } catch (err) {
    console.error('[PATCH /api/settlements/:id]', err);
    res.status(500).json({ error: 'Failed to update settlement.' });
  }
});

export default router;
