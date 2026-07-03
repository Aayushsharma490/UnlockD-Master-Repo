/**
 * GroupDetailsPage.tsx — Bill Splitting Group Details & Expenses
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Loader2, Receipt } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

interface Member {
  id: string;
  name: string;
  net_balance: number; // in paise
}

interface Expense {
  id: string;
  paid_by: string;
  payer_name: string;
  amount: number; // in paise
  description: string | null;
  split_type: 'equal' | 'custom';
  created_at: string;
}

interface Settlement {
  id: string;
  from_member: string;
  from_name: string;
  to_member: string;
  to_name: string;
  amount: number; // in paise
  status: 'pending' | 'paid';
  paid_at: string | null;
}

interface Group {
  id: string;
  name: string;
  created_at: string;
}

export const GroupDetailsPage: React.FC = () => {
  const { id: groupId } = useParams<{ id: string }>();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Member State
  const [newMemberName, setNewMemberName] = useState('');
  const [memLoading, setMemLoading] = useState(false);

  // Add Expense State
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayer, setExpensePayer] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Other');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [expLoading, setExpLoading] = useState(false);

  // Fetch full details
  const fetchGroupDetails = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroup(data.group);
      setMembers(data.members || []);
      setExpenses(data.expenses || []);
      setSettlements(data.settlements || []);

      // Default Payer selection
      if (data.members && data.members.length > 0) {
        setExpensePayer(data.members[0].id);
      }
    } catch (_) {
      setError('Could not retrieve group split information.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  // Add member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !groupId) return;

    setMemLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName }),
      });
      if (res.ok) {
        setNewMemberName('');
        // Refresh details (recalculates balances/settlements automatically)
        await fetchGroupDetails();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add member.');
      }
    } catch (_) {
      alert('Network error.');
    } finally {
      setMemLoading(false);
    }
  };

  // Add expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId || !expensePayer || !expenseAmount) return;

    const amtNum = Number(expenseAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    let payloadSplits: { member_id: string; amount_owed: number }[] = [];

    if (splitType === 'custom') {
      let sum = 0;
      for (const m of members) {
        const val = Number(customSplits[m.id] || 0);
        if (isNaN(val) || val < 0) {
          alert(`Invalid split amount for member ${m.name}`);
          return;
        }
        payloadSplits.push({ member_id: m.id, amount_owed: val });
        sum += val;
      }

      if (Math.round(sum * 100) !== Math.round(amtNum * 100)) {
        alert(
          `Sum of individual shares (₹${sum.toFixed(2)}) must equal total expense amount (₹${amtNum.toFixed(2)}).`
        );
        return;
      }
    }

    setExpLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid_by: expensePayer,
          amount: amtNum,
          description: expenseDesc,
          split_type: splitType,
          splits: splitType === 'custom' ? payloadSplits : undefined,
          category: expenseCategory,
        }),
      });

      if (res.ok) {
        setExpenseDesc('');
        setExpenseAmount('');
        setExpenseCategory('Other');
        setCustomSplits({});
        await fetchGroupDetails(); // Dynamic refresh
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit expense.');
      }
    } catch (_) {
      alert('Network error.');
    } finally {
      setExpLoading(false);
    }
  };

  // Mark settlement paid
  const handleMarkSettlementPaid = async (settlementId: string) => {
    try {
      const res = await fetch(`/api/groups/settlements/${settlementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (res.ok) {
        await fetchGroupDetails(); // Dynamic refresh
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to settle debt.');
      }
    } catch (_) {
      alert('Network error.');
    }
  };

  const pendingSettlements = settlements.filter((s) => s.status === 'pending');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-[--color-green]" size={36} />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="glass-card p-6 text-center" style={{ border: '1px solid rgba(181,83,60,0.15)', background: 'var(--color-terra-light)' }}>
        <p style={{ color: 'var(--color-terra)' }}>{error || 'Group not found.'}</p>
        <Link to="/groups" className="btn-secondary mt-2 inline-flex items-center gap-1.5" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to groups
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-6 w-full py-6"
    >
      {/* Header */}
      <div>
        <Link
          to="/groups"
          className="flex items-center gap-1.5 text-xs font-semibold hover:underline mb-3"
          style={{ color: 'var(--color-green)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} />
          Back to split list
        </Link>
        <p className="eyebrow mb-1">Group Ledger</p>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '36px',
            fontWeight: 400,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {group.name}
        </h1>
        <p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
          Active since: {new Date(group.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Members list & Add Member */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Members */}
          <section className="glass-card p-5" aria-label="Group Members">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[--color-text-muted] mt-0 mb-4">
              Cultivators
            </h3>

            <div className="flex flex-col gap-2.5">
              {members.map((m) => {
                const owesMoney = m.net_balance < 0;
                const isZero = m.net_balance === 0;
                const val = Math.abs(m.net_balance);
                const color = isZero
                  ? 'var(--color-text-muted)'
                  : owesMoney
                  ? 'var(--color-terra)'
                  : 'var(--color-green)';

                return (
                  <div
                    key={m.id}
                    className="flex justify-between items-center p-3 rounded-xl border bg-white/40"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                      {m.name}
                    </span>
                    <span className="text-xs font-medium" style={{ color }}>
                      {isZero ? 'settled' : owesMoney ? `owes ${formatCurrency(val)}` : `owed ${formatCurrency(val)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Add member form */}
            <form onSubmit={handleAddMember} className="flex gap-2 mt-4">
              <input
                type="text"
                className="verdant-input text-xs flex-1"
                placeholder="New member name"
                style={{ padding: '6px 12px' }}
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                disabled={memLoading}
                required
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                disabled={memLoading}
              >
                {memLoading ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </button>
            </form>
          </section>

          {/* Settle Up */}
          <section className="glass-card p-5" aria-label="Settlement instructions">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[--color-text-muted] mt-0 mb-4">
              Greedy Settle Route
            </h3>

            <div className="flex flex-col gap-2.5">
              {pendingSettlements.length === 0 ? (
                <div className="p-3 text-center rounded-xl bg-white/20 border border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    All debts simplified to zero.
                  </span>
                </div>
              ) : (
                pendingSettlements.map((s) => (
                  <div
                    key={s.id}
                    className="flex justify-between items-center p-3 rounded-xl border bg-white/40"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <div className="text-xs">
                      <span className="font-semibold text-[--color-text]">{s.from_name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}> owes </span>
                      <span className="font-semibold text-[--color-text]">{s.to_name}</span>
                      <p className="m-0 mt-0.5 font-bold" style={{ color: 'var(--color-terra)' }}>
                        {formatCurrency(s.amount)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleMarkSettlementPaid(s.id)}
                      className="p-1 rounded-lg border bg-white hover:bg-[--color-green-light] transition-colors"
                      style={{ borderColor: 'var(--color-border)', cursor: 'pointer' }}
                      title="Mark as paid"
                    >
                      <Check size={12} className="text-[--color-green]" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Center/Right: Add Expense form & Expenses history */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          
          {/* Add expense card */}
          <section className="glass-card p-6" aria-label="Add Expense">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[--color-text-muted] mt-0 mb-4">
              Add Expense
            </h3>

            <form onSubmit={handleAddExpense} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label htmlFor="exp-desc" className="eyebrow">
                  Description
                </label>
                <input
                  id="exp-desc"
                  type="text"
                  className="verdant-input"
                  placeholder="e.g. Villa Booking, Dinner pool"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  disabled={expLoading}
                />
              </div>

              <div className="flex flex-col gap-1.5 col-span-1">
                <label htmlFor="exp-amt" className="eyebrow">
                  Amount (₹)
                </label>
                <input
                  id="exp-amt"
                  type="number"
                  step="0.01"
                  className="verdant-input"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  disabled={expLoading}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5 col-span-1">
                <label htmlFor="exp-payer" className="eyebrow">
                  Paid By
                </label>
                <select
                  id="exp-payer"
                  className="verdant-input"
                  value={expensePayer}
                  onChange={(e) => setExpensePayer(e.target.value)}
                  disabled={expLoading}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 col-span-1">
                <label htmlFor="exp-category" className="eyebrow">
                  Category
                </label>
                <select
                  id="exp-category"
                  className="verdant-input"
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  disabled={expLoading}
                >
                  <option value="Food">Food</option>
                  <option value="Transport">Transport</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Bills">Bills</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 col-span-1">
                <label htmlFor="exp-split" className="eyebrow">
                  Split Type
                </label>
                <select
                  id="exp-split"
                  className="verdant-input"
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as 'equal' | 'custom')}
                  disabled={expLoading}
                >
                  <option value="equal">Split Equally</option>
                  <option value="custom">Split Custom</option>
                </select>
              </div>

              {/* Custom splits fields */}
              {splitType === 'custom' && (
                <div className="flex flex-col gap-2.5 col-span-2 p-4 rounded-xl border bg-white/20" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[--color-text-muted]">
                    Per-person share (Rupees)
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {members.map((m) => (
                      <div key={m.id} className="flex flex-col gap-1">
                        <label htmlFor={`custom-split-${m.id}`} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {m.name}
                        </label>
                        <input
                          id={`custom-split-${m.id}`}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className="verdant-input text-xs"
                          style={{ padding: '6px 12px' }}
                          value={customSplits[m.id] || ''}
                          onChange={(e) => {
                            setCustomSplits({
                              ...customSplits,
                              [m.id]: e.target.value,
                            });
                          }}
                          disabled={expLoading}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-2 mt-2">
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={expLoading || members.length === 0}
                >
                  {expLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      Record Expense
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Expenses timeline */}
          <section className="glass-card p-6" aria-label="Expense timeline">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[--color-text-muted]" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[--color-text-muted] m-0">
                Expense history
              </h3>
            </div>

            <div className="flex flex-col gap-3">
              {expenses.length === 0 ? (
                <div className="p-6 text-center text-xs text-[--color-text-faint] border border-dashed rounded-xl">
                  No expenses reported in this split group.
                </div>
              ) : (
                expenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex justify-between items-start p-4 rounded-xl border bg-white/20"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <div>
                      <h4 className="text-sm font-semibold m-0" style={{ color: 'var(--color-text)' }}>
                        {e.description || 'Unspecified Expense'}
                      </h4>
                      <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Paid by {e.payer_name} • {e.split_type === 'equal' ? 'Split equally' : 'Custom split'}
                      </p>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>
                        {new Date(e.created_at).toLocaleDateString()} at {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold font-display" style={{ color: 'var(--color-text)' }}>
                        {formatCurrency(e.amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
};

export default GroupDetailsPage;
