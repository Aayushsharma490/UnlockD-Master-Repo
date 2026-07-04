/**
 * TransactionsPage.tsx — Upgraded with URL Query Param Sync, Debounced Search,
 * Dynamic Filters, Downloadable CSV Export, Inline Row Editing, and Scheduled/Recurring Transfers support.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccounts } from '../../hooks/useAccounts';
import { formatCurrency } from '../../utils/currency';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Download, Edit3, X, Save, RefreshCw, Loader2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Transaction } from '../../types';

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Uncategorized'];

interface ScheduledTransfer {
  id: string;
  from_account: string;
  to_account: string;
  from_name: string;
  to_name: string;
  amount: number;
  frequency: 'once' | 'weekly' | 'monthly';
  next_run_date: string;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  last_run_at: string | null;
  created_at: string;
}

export const TransactionsPage: React.FC = () => {
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const [searchParams, setSearchParams] = useSearchParams();

  // Internal states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scheduled transfers states
  const [activeTab, setActiveTab] = useState<'all' | 'scheduled'>('all');
  const [scheduledTransfers, setScheduledTransfers] = useState<ScheduledTransfer[]>([]);
  const [isScheduledLoading, setIsScheduledLoading] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounced search term
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  // Edit states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    merchant: '',
    category: 'Uncategorized',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Owned accounts map to determine inflows vs outflows
  const ownedAccountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);

  // Read density settings
  const isCompact = useMemo(() => {
    return user?.preferences?.compact ?? (localStorage.getItem('compact_density') === 'true');
  }, [user]);

  // Parse active filter parameters
  const activeParams = useMemo(() => {
    return {
      search: searchParams.get('search') || '',
      category: searchParams.get('category') || '',
      account: searchParams.get('account') || '',
      minAmount: searchParams.get('minAmount') || '',
      maxAmount: searchParams.get('maxAmount') || '',
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      page: searchParams.get('page') || '1',
    };
  }, [searchParams]);

  // Fetch transactions from the backend
  const fetchTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Construct request query
      const urlParams = new URLSearchParams();
      if (activeParams.search) urlParams.set('search', activeParams.search);
      if (activeParams.category) urlParams.set('category', activeParams.category);
      if (activeParams.account) urlParams.set('account', activeParams.account);
      if (activeParams.minAmount) urlParams.set('minAmount', activeParams.minAmount);
      if (activeParams.maxAmount) urlParams.set('maxAmount', activeParams.maxAmount);
      if (activeParams.dateFrom) urlParams.set('dateFrom', activeParams.dateFrom);
      if (activeParams.dateTo) urlParams.set('dateTo', activeParams.dateTo);
      urlParams.set('page', activeParams.page);

      const res = await fetch(`/api/transactions?${urlParams.toString()}`);
      if (!res.ok) throw new Error('API server returned error status.');
      const data = await res.json();

      setTransactions(data.transactions || []);
      setCurrentPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve transactions.');
    } finally {
      setIsLoading(false);
    }
  }, [activeParams]);

  // Trigger search fetch on parameter changes
  useEffect(() => {
    if (activeTab === 'all') {
      fetchTransactions();
    }
  }, [activeTab, fetchTransactions]);

  // Sync search input with parameter updates (with debounce)
  useEffect(() => {
    const handler = setTimeout(() => {
      const current = searchParams.get('search') || '';
      if (localSearch !== current) {
        setSearchParams((prev) => {
          if (localSearch) prev.set('search', localSearch);
          else prev.delete('search');
          prev.set('page', '1');
          return prev;
        });
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [localSearch, setSearchParams, searchParams]);

  // Fetch scheduled transfers
  const fetchScheduledTransfers = useCallback(async () => {
    try {
      setIsScheduledLoading(true);
      const res = await fetch('/api/scheduled-transfers');
      if (!res.ok) throw new Error('Failed to load scheduled transfers.');
      const data = await res.json();
      setScheduledTransfers(data.scheduledTransfers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsScheduledLoading(false);
    }
  }, []);

  const handleUpdateScheduleStatus = async (id: string, status: 'active' | 'paused' | 'cancelled') => {
    try {
      const res = await fetch(`/api/scheduled-transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update schedule.');
      }
      fetchScheduledTransfers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  useEffect(() => {
    if (activeTab === 'scheduled') {
      fetchScheduledTransfers();
    }
  }, [activeTab, fetchScheduledTransfers]);

  // Helpers to update individual filter values
  const updateFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      prev.set('page', '1');
      return prev;
    });
  };

  const clearFilters = () => {
    setLocalSearch('');
    setSearchParams(new URLSearchParams({ page: '1' }));
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set('page', String(newPage));
      return prev;
    });
  };

  // Row selection expand handler
  const handleRowClick = (tx: Transaction) => {
    if (isEditing) return; // ignore expansion click if editing is active
    setExpandedId((prev) => (prev === tx.id ? null : tx.id));
  };

  // Inline edit toggle
  const startEditing = (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation(); // prevent collapsing row
    setIsEditing(tx.id);
    setEditForm({
      description: tx.description || '',
      merchant: tx.merchant || '',
      category: tx.category || 'Uncategorized',
    });
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(null);
  };

  // Save changes via PATCH /api/transactions/:id
  const saveTransactionEdit = async (e: React.MouseEvent, txId: string) => {
    e.stopPropagation();
    try {
      setIsSaving(true);
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: editForm.description || null,
          merchant: editForm.merchant || null,
          category: editForm.category,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update transaction.');
      }

      const data = await res.json();
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, ...data.transaction } : t))
      );
      setIsEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update transaction details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const urlParams = new URLSearchParams();
    if (activeParams.search) urlParams.set('search', activeParams.search);
    if (activeParams.category) urlParams.set('category', activeParams.category);
    if (activeParams.account) urlParams.set('account', activeParams.account);
    if (activeParams.minAmount) urlParams.set('minAmount', activeParams.minAmount);
    if (activeParams.maxAmount) urlParams.set('maxAmount', activeParams.maxAmount);
    if (activeParams.dateFrom) urlParams.set('dateFrom', activeParams.dateFrom);
    if (activeParams.dateTo) urlParams.set('dateTo', activeParams.dateTo);
    window.open(`/api/transactions/export?${urlParams.toString()}`);
  };

  const formatTimestampShort = (iso: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-6 w-full py-6"
    >
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="eyebrow mb-1">Ledger</p>
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
            Ledger
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Filter, search, or edit your financial audit logs. Stored securely.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="btn-accent flex items-center gap-2"
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-4 border-b border-[--color-border] pb-1 mt-2">
        <button
          onClick={() => setActiveTab('all')}
          className="pb-2 text-sm font-semibold tracking-wider uppercase transition-all"
          style={{
            color: activeTab === 'all' ? 'var(--color-green)' : 'var(--color-text-muted)',
            borderBottom: activeTab === 'all' ? '2px solid var(--color-green)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          Ledger Logs
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className="pb-2 text-sm font-semibold tracking-wider uppercase transition-all"
          style={{
            color: activeTab === 'scheduled' ? 'var(--color-green)' : 'var(--color-text-muted)',
            borderBottom: activeTab === 'scheduled' ? '2px solid var(--color-green)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          Scheduled Transfers
        </button>
      </div>

      {activeTab === 'all' ? (
        <>
          {/* Filter Toolbar */}
          <div
            className="glass-card p-5 flex flex-col gap-4"
            style={{ background: 'rgba(255,255,255,0.4)', borderColor: 'var(--color-border)' }}
          >
            {/* Row 1: Search & Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search bar */}
              <div className="md:col-span-2 relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[--color-text-faint]"
                />
                <input
                  type="text"
                  className="verdant-input pl-10"
                  placeholder="Search descriptions, merchants, or notes..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                />
                {localSearch && (
                  <button
                    onClick={() => setLocalSearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[--color-text-faint] hover:text-[--color-text-muted]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div>
                <select
                  className="verdant-input"
                  value={activeParams.category}
                  onChange={(e) => updateFilter('category', e.target.value)}
                  aria-label="Filter by Category"
                >
                  <option value="">All Categories</option>
                  {ALLOWED_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Filter */}
              <div>
                <select
                  className="verdant-input"
                  value={activeParams.account}
                  onChange={(e) => updateFilter('account', e.target.value)}
                  aria-label="Filter by Account"
                >
                  <option value="">All Portfolios</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Advanced filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center pt-2 border-t border-[--color-border]/50">
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="number"
                  placeholder="Min (₹)"
                  className="verdant-input text-xs"
                  value={activeParams.minAmount}
                  onChange={(e) => updateFilter('minAmount', e.target.value)}
                />
                <span className="text-xs text-[--color-text-faint]">to</span>
                <input
                  type="number"
                  placeholder="Max (₹)"
                  className="verdant-input text-xs"
                  value={activeParams.maxAmount}
                  onChange={(e) => updateFilter('maxAmount', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="date"
                  className="verdant-input text-xs"
                  value={activeParams.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  aria-label="From date"
                />
                <span className="text-xs text-[--color-text-faint]">to</span>
                <input
                  type="date"
                  className="verdant-input text-xs"
                  value={activeParams.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  aria-label="To date"
                />
              </div>

              <div className="text-right">
                {(activeParams.search || activeParams.category || activeParams.account || activeParams.minAmount || activeParams.maxAmount || activeParams.dateFrom || activeParams.dateTo) && (
                  <button
                    onClick={clearFilters}
                    className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 justify-end w-full hover:text-[--color-terra] text-[--color-text-muted] transition-colors"
                  >
                    <RefreshCw size={12} />
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Transactions Ledger Card */}
          <div className="glass-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[--color-border] flex justify-between items-center bg-white/30">
              <span className="text-xs font-semibold tracking-wider uppercase text-[--color-text-muted]">
                Found {totalCount} transaction{totalCount !== 1 && 's'}
              </span>
              {isCompact && (
                <span className="text-[10px] px-2 py-0.5 rounded border border-[--color-border] text-[--color-text-muted] uppercase tracking-wider">
                  Compact View
                </span>
              )}
            </div>

            <div className="divide-y divide-[--color-border]">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="p-5 flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-[--color-border]" />
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="h-4 bg-[--color-border] w-1/3 rounded" />
                      <div className="h-3 bg-[--color-border] w-1/4 rounded" />
                    </div>
                    <div className="h-6 bg-[--color-border] w-20 rounded" />
                  </div>
                ))
              ) : error ? (
                <div className="p-8 text-center text-[--color-terra]">
                  <p>Failed to retrieve ledger data: {error}</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-12 text-center text-[--color-text-muted]">
                  No transactions match your search parameters.
                </div>
              ) : (
                transactions.map((tx) => {
                  const isDebit = ownedAccountIds.has(tx.from_account);
                  const isFailed = tx.status === 'failed';
                  const directionSign = isFailed ? '' : isDebit ? '−' : '+';
                  const amountColor = isFailed
                    ? 'var(--color-terra)'
                    : tx.status === 'pending'
                    ? 'var(--color-text-muted)'
                    : isDebit
                    ? 'var(--color-terra)'
                    : 'var(--color-green)';

                  const isExpanded = expandedId === tx.id;
                  const isRowEditing = isEditing === tx.id;

                  // Title logic: show description/merchant if available, else standard names
                  const transactionTitle = tx.description
                    ? tx.description
                    : `${tx.from_name} → ${tx.to_name}`;
                  const transactionSubtitle = tx.merchant ? tx.merchant : `Transfer`;

                  const avatarLetter = (tx.merchant || tx.to_name || 'T').charAt(0).toUpperCase();

                  return (
                    <div key={tx.id} className="transition-colors hover:bg-white/10">
                      {/* Main Row */}
                      <div
                        onClick={() => handleRowClick(tx)}
                        className="flex items-center gap-4 cursor-pointer select-none"
                        style={{
                          padding: isCompact ? '10px 24px' : '16px 24px',
                        }}
                      >
                        {/* Circle Avatar */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                          style={{
                            background: 'rgba(28,27,25,0.06)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          {avatarLetter}
                        </div>

                        {/* Parties details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                              {transactionTitle}
                            </span>
                            {tx.category && tx.category !== 'Uncategorized' && (
                              <span
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                style={{
                                  background: 'var(--color-green-light)',
                                  color: 'var(--color-green)',
                                }}
                              >
                                {tx.category}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <span>{transactionSubtitle}</span>
                            <span>•</span>
                            <span>{formatTimestampShort(tx.created_at)}</span>
                          </div>
                        </div>

                        {/* Amount & Status Badge */}
                        <div className="text-right flex-shrink-0">
                          <span
                            className="text-sm font-medium tabular-nums font-display"
                            style={{ color: amountColor, fontSize: '16px' }}
                          >
                            {directionSign}
                            {formatCurrency(tx.amount)}
                          </span>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <StatusBadge status={tx.status} />
                            <button
                              onClick={(e) => startEditing(e, tx)}
                              className="text-[11px] uppercase tracking-wider font-semibold opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 text-[--color-text-muted]"
                            >
                              <Edit3 size={11} />
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Panel */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden bg-[--color-background] border-t border-[--color-border]/50"
                          >
                            <div className="px-6 py-5 flex flex-col gap-4 text-xs">
                              {isRowEditing ? (
                                <div className="flex flex-col gap-4">
                                  <h4 className="font-semibold text-sm">Edit Transaction Details</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="flex flex-col gap-1">
                                      <label className="eyebrow">Description</label>
                                      <input
                                        type="text"
                                        className="verdant-input text-xs"
                                        value={editForm.description}
                                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="eyebrow">Merchant</label>
                                      <input
                                        type="text"
                                        className="verdant-input text-xs"
                                        value={editForm.merchant}
                                        onChange={(e) => setEditForm({ ...editForm, merchant: e.target.value })}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="eyebrow">Category</label>
                                      <select
                                        className="verdant-input text-xs"
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                      >
                                        {ALLOWED_CATEGORIES.map((cat) => (
                                          <option key={cat} value={cat}>
                                            {cat}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      disabled={isSaving}
                                      onClick={(e) => saveTransactionEdit(e, tx.id)}
                                      className="btn-primary text-xs flex items-center gap-1.5"
                                      style={{ padding: '6px 12px' }}
                                    >
                                      <Save size={12} />
                                      {isSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                      onClick={cancelEditing}
                                      className="btn-secondary text-xs flex items-center gap-1.5"
                                      style={{ padding: '6px 12px' }}
                                    >
                                      <X size={12} />
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                      <p className="eyebrow mb-0.5">Transaction ID</p>
                                      <code className="font-mono text-[10px] text-[--color-text-muted]">{tx.id}</code>
                                    </div>
                                    <div>
                                      <p className="eyebrow mb-0.5">Idempotency Key</p>
                                      <code className="font-mono text-[10px] text-[--color-text-muted] truncate block max-w-[200px]" title={tx.idempotency_key || 'None'}>
                                        {tx.idempotency_key || 'None'}
                                      </code>
                                    </div>
                                    <div>
                                      <p className="eyebrow mb-0.5">From Account</p>
                                      <span className="font-medium text-[--color-text]">{tx.from_name}</span>
                                    </div>
                                    <div>
                                      <p className="eyebrow mb-0.5">To Account</p>
                                      <span className="font-medium text-[--color-text]">{tx.to_name}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1 bg-white/40 p-3.5 rounded-xl border border-[--color-border]/50 mt-1">
                                    <span className="eyebrow">User Note</span>
                                    <p className="italic text-[--color-text-muted] m-0">
                                      {tx.note ? `"${tx.note}"` : 'No memo attached to this ledger record.'}
                                    </p>
                                  </div>

                                  <div className="flex gap-2 justify-end mt-2">
                                    <button
                                      onClick={(e) => startEditing(e, tx)}
                                      className="btn-secondary text-xs flex items-center gap-1.5"
                                      style={{ padding: '6px 12px' }}
                                    >
                                      <Edit3 size={12} />
                                      Edit Record
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pagination Controls */}
          {!isLoading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between mt-2 px-2">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="btn-secondary text-xs"
                style={{ padding: '6px 12px' }}
              >
                Previous
              </button>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="btn-secondary text-xs"
                style={{ padding: '6px 12px' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[--color-border] flex justify-between items-center bg-white/30">
            <span className="text-xs font-semibold tracking-wider uppercase text-[--color-text-muted]">
              Recurring and Scheduled Schedules
            </span>
          </div>

          <div className="p-6">
            {isScheduledLoading ? (
              <div className="py-8 text-center text-[--color-text-muted]">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-[--color-green]" />
                Loading schedules...
              </div>
            ) : scheduledTransfers.length === 0 ? (
              <div className="py-12 text-center text-[--color-text-muted]">
                No scheduled transfers active. Create one by selecting a frequency other than "Once" when sending money.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th className="py-3 px-4 eyebrow">Route</th>
                      <th className="py-3 px-4 eyebrow">Amount</th>
                      <th className="py-3 px-4 eyebrow">Frequency</th>
                      <th className="py-3 px-4 eyebrow">Next Run</th>
                      <th className="py-3 px-4 eyebrow">Status</th>
                      <th className="py-3 px-4 eyebrow text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledTransfers.map((st) => {
                      let statusBg = 'rgba(28,27,25,0.06)';
                      let statusColor = 'var(--color-text-muted)';
                      if (st.status === 'active') {
                        statusBg = 'var(--color-green-light)';
                        statusColor = 'var(--color-green)';
                      } else if (st.status === 'paused') {
                        statusBg = 'rgba(181,83,60,0.1)';
                        statusColor = 'var(--color-terra)';
                      } else if (st.status === 'completed') {
                        statusBg = 'rgba(47,79,62,0.1)';
                        statusColor = 'var(--color-green)';
                      }

                      return (
                        <tr key={st.id} style={{ borderBottom: '1px solid var(--color-border)' }} className="text-sm">
                          <td className="py-3 px-4 font-medium">
                            {st.from_name} ➔ {st.to_name}
                          </td>
                          <td className="py-3 px-4 font-bold tabular-nums">
                            ₹{(st.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 capitalize font-semibold">{st.frequency}</td>
                          <td className="py-3 px-4 tabular-nums">
                            {new Date(st.next_run_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider"
                              style={{ background: statusBg, color: statusColor }}
                            >
                              {st.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              {st.status === 'active' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateScheduleStatus(st.id, 'paused')}
                                    className="btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                  >
                                    Pause
                                  </button>
                                  <button
                                    onClick={() => handleUpdateScheduleStatus(st.id, 'cancelled')}
                                    className="btn-accent"
                                    style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--color-terra)', color: '#fff' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {st.status === 'paused' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateScheduleStatus(st.id, 'active')}
                                    className="btn-primary"
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                  >
                                    Resume
                                  </button>
                                  <button
                                    onClick={() => handleUpdateScheduleStatus(st.id, 'cancelled')}
                                    className="btn-accent"
                                    style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--color-terra)', color: '#fff' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TransactionsPage;
