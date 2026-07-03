/**
 * DashboardPage.tsx — Protected home dashboard view
 * Composes total balance hero, account cards, budgets widget, recharts analytics, and timeline lists.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccounts } from '../../hooks/useAccounts';
import { useTransactions } from '../../hooks/useTransactions';
import { formatCurrency } from '../../utils/currency';
import { AccountCard } from '../accounts/AccountCard';
import { BalanceCounter } from '../accounts/BalanceCounter';
import { TransactionRow } from '../transactions/TransactionRow';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, TrendingUp, Inbox, PieChart, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardPageProps {
  onOpenTransfer: () => void;
}

interface BudgetSummaryItem {
  category: string;
  limit_amount: number;
  spent: number;
  remaining: number;
  percentUsed: number;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenTransfer }) => {
  const { user } = useAuth();
  const { accounts, isLoading: accountsLoading, error: accountsError } = useAccounts();
  const { transactions, isLoading: txLoading, error: txError } = useTransactions();

  // Budgets summary state
  const [budgets, setBudgets] = useState<BudgetSummaryItem[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(true);

  const fetchBudgetsSummary = useCallback(async () => {
    if (!user) return;
    try {
      setBudgetsLoading(true);
      const res = await fetch('/api/budgets');
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets || []);
      }
    } catch (_) {
      console.warn('[Dashboard] Could not fetch budget summaries.');
    } finally {
      setBudgetsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBudgetsSummary();
  }, [fetchBudgetsSummary]);

  // 1. Greeting
  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good morning';
    if (hours < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // 2. Sum Total Balance
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  // 3. Recent 5 Transactions
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  // 4. Calculate 7-day transaction volumes from real history
  const chartData = useMemo(() => {
    const result: { name: string; volume: number; rawDate: string }[] = [];
    const now = new Date();
    
    // Create map of the last 7 days
    const dayMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dayMap[dateStr] = 0;
    }

    transactions.forEach((tx) => {
      if (tx.status !== 'success') return;
      const txDateStr = tx.created_at.split('T')[0];
      if (dayMap[txDateStr] !== undefined) {
        dayMap[txDateStr] += tx.amount;
      }
    });

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    Object.keys(dayMap).sort().forEach((dateStr) => {
      const d = new Date(dateStr);
      const label = `${weekdayNames[d.getDay()]} ${d.getDate()}`;
      result.push({
        name: label,
        volume: dayMap[dateStr] / 100,
        rawDate: dateStr,
      });
    });

    return result;
  }, [transactions]);

  // 5. Select 2-3 categories closest to their limit
  const activeBudgetsSummary = useMemo(() => {
    return budgets
      .filter((b) => b.limit_amount > 0)
      .sort((a, b) => b.percentUsed - a.percentUsed)
      .slice(0, 3);
  }, [budgets]);

  return (
    <div className="flex flex-col gap-8 w-full py-6">
      {/* Greeting & Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="eyebrow mb-1">{greeting}</p>
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
            Welcome, {user?.name}.
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Your holdings are tracked.
          </p>
        </div>

        <button onClick={onOpenTransfer} className="btn-primary" id="dashboard-transfer-cta">
          <ArrowLeftRight size={15} />
          New Transfer
        </button>
      </div>

      {/* Hero Balance Panel */}
      <section className="glass-card p-8 flex flex-col md:flex-row md:items-center justify-between gap-6" aria-label="Total Wealth">
        <div>
          <p className="eyebrow mb-2">Total Wealth Cultivated</p>
          <BalanceCounter balance={totalBalance} className="text-4xl md:text-5xl" />
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--color-green)' }}>
            <TrendingUp size={14} />
            <span>Active compound growth enabled</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 max-w-[280px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
            Security Audit Active
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            All operations process inside serialized database transactions. Deduplication guards are enabled.
          </p>
        </div>
      </section>

      {/* Portfolios & Budgets summary split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Portfolios list (3/5 columns) */}
        <section aria-label="Accounts list" className="lg:col-span-3 flex flex-col gap-4">
          <p className="eyebrow">Your Portfolios</p>
          {accountsError ? (
            <div className="glass-card p-5 flex-1 flex items-center justify-center bg-[--color-terra-light]" style={{ border: '1px solid rgba(181,83,60,0.15)' }}>
              <p className="text-sm" style={{ color: 'var(--color-terra)' }}>
                Could not load accounts: {accountsError}
              </p>
            </div>
          ) : accountsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              <div className="glass-card h-40 animate-pulse bg-[--color-border]/30" />
              <div className="glass-card h-40 animate-pulse bg-[--color-border]/30" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              {accounts.map((acc, index) => (
                <AccountCard key={acc.id} account={acc} index={index} />
              ))}
            </div>
          )}
        </section>

        {/* Budgets summary widget (2/5 columns) */}
        <section aria-label="Budgets widget" className="lg:col-span-2 glass-card p-6 flex flex-col justify-between min-h-[220px]">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="eyebrow mb-1">Envelopes</p>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[--color-text-muted] m-0">
                Budgets summary
              </h3>
            </div>
            <Link to="/budgets" className="text-xs font-semibold hover:underline" style={{ color: 'var(--color-green)' }}>
              View all
            </Link>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3">
            {budgetsLoading ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse bg-[--color-border]/30 rounded-lg" />
              ))
            ) : activeBudgetsSummary.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-4">
                <PieChart size={20} strokeWidth={1.5} className="text-[--color-text-faint] mb-1.5" />
                <p className="text-xs m-0" style={{ color: 'var(--color-text-muted)' }}>
                  No active budgets configured.
                </p>
              </div>
            ) : (
              activeBudgetsSummary.map((b) => {
                const isOverLimit = b.percentUsed >= 100;
                const isNearLimit = b.percentUsed >= 80;
                const color = isOverLimit ? 'var(--color-terra)' : isNearLimit ? '#C48A54' : 'var(--color-green)';

                return (
                  <div key={b.category} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      <span className="flex items-center gap-1.5">
                        {isOverLimit && <AlertTriangle size={12} className="text-[--color-terra]" />}
                        {b.category}
                      </span>
                      <span>
                        {formatCurrency(b.spent)} / {formatCurrency(b.limit_amount)}
                      </span>
                    </div>

                    {/* Progress track */}
                    <div style={{ width: '100%', height: 4, background: 'rgba(28,27,25,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, b.percentUsed)}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Chart and Recent activity split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recharts Spend flow Chart */}
        <section className="glass-card p-6 lg:col-span-3 flex flex-col justify-between" aria-label="Holdings Activity Chart">
          <div className="mb-4">
            <p className="eyebrow mb-1">Analytics</p>
            <h3 className="text-base font-medium m-0" style={{ color: 'var(--color-text)' }}>
              7-Day Transaction Volume
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Rupee volume shifted across checking/savings profiles.
            </p>
          </div>

          <div style={{ width: '100%', height: 200 }} className="mt-4">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  stroke="rgba(28,27,25,0.3)"
                  tick={{ fontSize: 10, fontFamily: 'var(--font-ui)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(28,27,25,0.3)"
                  tickFormatter={(val) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  tick={{ fontSize: 10, fontFamily: 'var(--font-ui)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Volume Moved']}
                  contentStyle={{
                    background: '#FAF7F2',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--color-text)',
                  }}
                  cursor={{ fill: 'rgba(47,79,62,0.03)' }}
                />
                <Bar
                  dataKey="volume"
                  fill="var(--color-green)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Recent activity Widget */}
        <section className="glass-card p-6 lg:col-span-2 flex flex-col" aria-label="Recent activity">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="eyebrow mb-1">Timeline</p>
              <h3 className="text-base font-medium m-0" style={{ color: 'var(--color-text)' }}>
                Recent Transfers
              </h3>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--color-green)' }}
            >
              View all
            </Link>
          </div>

          <div className="flex-1 flex flex-col justify-start">
            {txError ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--color-terra)' }}>
                Failed to load recent activity.
              </p>
            ) : txLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-14 animate-pulse bg-[--color-border]/30 rounded-xl mb-2" />
              ))
            ) : recentTransactions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-[--color-text-faint]">
                <Inbox size={20} strokeWidth={1.5} className="mb-2" />
                <p className="text-xs">No transaction history found.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-[--color-border]/60">
                {recentTransactions.map((tx, index) => (
                  <TransactionRow key={tx.id} transaction={tx} index={index} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
