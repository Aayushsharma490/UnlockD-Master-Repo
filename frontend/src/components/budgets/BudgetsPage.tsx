/**
 * BudgetsPage.tsx — Smart Budget Category Settings and Live Utilization
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, Edit2, HelpCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

interface Budget {
  category: string;
  month: string;
  limit_amount: number; // in paise
  spent: number; // in paise
  remaining: number; // in paise
  percentUsed: number;
}

export const BudgetsPage: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editLimitInput, setEditLimitInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBudgets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/budgets');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBudgets(data.budgets || []);
    } catch (_) {
      setError('Could not retrieve budget summaries from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleEditClick = (category: string, currentLimitPaise: number) => {
    setEditingCategory(category);
    // Convert paise to rupees for input editing
    setEditLimitInput(currentLimitPaise > 0 ? (currentLimitPaise / 100).toString() : '');
  };

  const handleSaveBudget = async (category: string) => {
    const limitNum = Number(editLimitInput);
    if (isNaN(limitNum) || limitNum < 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          limit_amount: limitNum,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Update local state immediately
        setBudgets((prev) =>
          prev.map((b) => (b.category === category ? data.budget : b))
        );
        setEditingCategory(null);
      } else {
        alert(data.error || 'Failed to update budget.');
      }
    } catch (_) {
      alert('Network error — please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-6 w-full py-6"
    >
      {/* Title block */}
      <div>
        <p className="eyebrow mb-1">Envelopes</p>
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
          Budgets
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Monitor category ceilings. Live utilization shifts to warning indicators above 80% usage.
        </p>
      </div>

      {/* Categories grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="glass-card h-48 animate-pulse bg-[--color-border]/30" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center" style={{ border: '1px solid rgba(181,83,60,0.15)', background: 'var(--color-terra-light)' }}>
          <p className="text-sm" style={{ color: 'var(--color-terra)' }}>{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((b) => {
            const isEditing = editingCategory === b.category;
            const hasLimit = b.limit_amount > 0;
            const isNearLimit = b.percentUsed >= 80;
            const isOverLimit = b.percentUsed >= 100;

            // Determine bar color
            const barColor = isOverLimit
              ? 'var(--color-terra)' // terracotta red
              : isNearLimit
              ? '#C48A54' // sandy orange/terracotta warning
              : 'var(--color-green)'; // forest green

            return (
              <div key={b.category} className="glass-card p-6 flex flex-col justify-between min-h-[180px]">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold m-0" style={{ color: 'var(--color-text)' }}>
                      {b.category}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
                      Month: {b.month}
                    </p>
                  </div>

                  {/* Actions */}
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSaveBudget(b.category)}
                        disabled={actionLoading}
                        className="p-1.5 rounded-lg border bg-white/60 hover:bg-white transition-colors"
                        style={{ borderColor: 'var(--color-border)', cursor: 'pointer' }}
                        aria-label="Save Budget"
                      >
                        {actionLoading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEditClick(b.category, b.limit_amount)}
                      className="p-1.5 rounded-lg border bg-white/30 hover:bg-white/60 transition-colors"
                      style={{ borderColor: 'var(--color-border)', cursor: 'pointer' }}
                      aria-label="Edit Budget"
                    >
                      <Edit2 size={13} color="var(--color-text-muted)" />
                    </button>
                  )}
                </div>

                {/* Details */}
                <div className="my-4 flex items-baseline justify-between">
                  {isEditing ? (
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>₹</span>
                      <input
                        type="number"
                        className="verdant-input text-sm"
                        style={{ padding: '4px 8px', maxWidth: '120px' }}
                        placeholder="Limit (INR)"
                        value={editLimitInput}
                        onChange={(e) => setEditLimitInput(e.target.value)}
                        disabled={actionLoading}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="text-xs"
                        style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-2xl font-display font-medium text-[--color-text]">
                          {formatCurrency(b.spent)}
                        </span>
                        <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>
                          spent
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Limit:{' '}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                          {hasLimit ? formatCurrency(b.limit_amount) : 'Not configured'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                {hasLimit && !isEditing && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      <span>
                        {isOverLimit ? 'Limit crossed' : `${formatCurrency(b.remaining)} remaining`}
                      </span>
                      <span className="font-semibold">{b.percentUsed}%</span>
                    </div>

                    {/* Progress track */}
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        background: 'rgba(28,27,25,0.06)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, b.percentUsed)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          background: barColor,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Warning banners */}
                {!hasLimit && !isEditing && (
                  <div className="flex items-center gap-2 p-2 rounded bg-white/40 border border-dashed border-[--color-border] justify-center">
                    <HelpCircle size={13} className="text-[--color-text-faint]" />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Click edit icon to set limit constraints.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default BudgetsPage;
