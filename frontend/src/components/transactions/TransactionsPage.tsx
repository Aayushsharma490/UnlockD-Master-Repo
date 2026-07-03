/**
 * TransactionsPage.tsx — Upgraded with URL Query Param Sync, Debounced Search,
 * Dynamic Filters, Downloadable CSV Export, and Inline Row Editing.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccounts } from '../../hooks/useAccounts';
import { formatCurrency } from '../../utils/currency';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, FileText, CheckCircle2, Shield, Download, Edit3, X, Save, RefreshCw } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Transaction } from '../../types';

const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Uncategorized'];

export const TransactionsPage: React.FC = () => {
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const [searchParams, setSearchParams] = useSearchParams();

  // Internal states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
      setCurrentPage(parseInt(activeParams.page, 10) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve transactions.');
    } finally {
      setIsLoading(false);
    }
  }, [activeParams]);

  // Sync API fetches with search query params
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Debounced search handler (~300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (localSearch.trim()) {
          next.set('search', localSearch.trim());
        } else {
          next.delete('search');
        }
        next.set('page', '1'); // Reset pagination
        return next;
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [localSearch, setSearchParams]);

  // Update filter parameters helper
  const updateFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      next.set('page', '1'); // Reset pagination
      return next;
    });
  };

  // Pagination helper
  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
  };

  // Row expand logic
  const handleRowClick = (tx: Transaction) => {
    if (expandedId === tx.id) {
      setExpandedId(null);
      setIsEditing(null);
    } else {
      setExpandedId(tx.id);
      setIsEditing(null);
      setEditForm({
        description: tx.description || tx.note || '',
        merchant: tx.merchant || '',
        category: tx.category || 'Uncategorized',
      });
    }
  };

  // Trigger inline editing edit mode
  const handleStartEdit = (tx: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(tx.id);
    setEditForm({
      description: tx.description || tx.note || '',
      merchant: tx.merchant || '',
      category: tx.category || 'Uncategorized',
    });
  };

  // Save changes via PATCH /api/transactions/:id
  const handleSaveChanges = async (txId: string) => {
    try {
      setIsSaving(true);
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editForm.description,
          merchant: editForm.merchant,
          category: editForm.category,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update transaction.');
      }

      const data = await res.json();
      
      // Update local transaction state in-place
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, ...data.transaction } : t))
      );
      setIsEditing(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger CSV export matching active filters
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

  const formatTimestampFull = (iso: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(iso));
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
            Transactions
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
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Range Filters (Amount & Dates) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Min Amount */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
              Min Amount (₹)
            </label>
            <input
              type="number"
              step="any"
              className="verdant-input"
              placeholder="0.00"
              value={activeParams.minAmount}
              onChange={(e) => updateFilter('minAmount', e.target.value)}
            />
          </div>

          {/* Max Amount */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
              Max Amount (₹)
            </label>
            <input
              type="number"
              step="any"
              className="verdant-input"
              placeholder="10000.00"
              value={activeParams.maxAmount}
              onChange={(e) => updateFilter('maxAmount', e.target.value)}
            />
          </div>

          {/* Date From */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
              Date From
            </label>
            <input
              type="date"
              className="verdant-input text-xs"
              value={activeParams.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
              Date To
            </label>
            <input
              type="date"
              className="verdant-input text-xs"
              value={activeParams.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
            />
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
                          onClick={(e) => handleStartEdit(tx, e)}
                          className="text-[--color-text-faint] hover:text-[--color-text-muted] p-0.5 rounded transition-all"
                          aria-label="Edit transaction"
                        >
                          <Edit3 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Forensic Details & Edit Form */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden bg-white/20 border-t border-[--color-border]"
                      >
                        {isRowEditing ? (
                          /* Inline Editing Form */
                          <div className="px-6 py-5 flex flex-col gap-4 border-b border-[--color-border] bg-white/30">
                            <p className="text-xs font-semibold text-[--color-green] uppercase tracking-wider m-0">
                              Edit Transaction Details
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {/* Description Input */}
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
                                  Description
                                </label>
                                <input
                                  type="text"
                                  className="verdant-input"
                                  value={editForm.description}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, description: e.target.value }))
                                  }
                                />
                              </div>

                              {/* Merchant Input */}
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
                                  Merchant
                                </label>
                                <input
                                  type="text"
                                  className="verdant-input"
                                  value={editForm.merchant}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, merchant: e.target.value }))
                                  }
                                />
                              </div>

                              {/* Category Select */}
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
                                  Category
                                </label>
                                <select
                                  className="verdant-input"
                                  value={editForm.category}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, category: e.target.value }))
                                  }
                                >
                                  {ALLOWED_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Form Buttons */}
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                disabled={isSaving}
                                onClick={() => setIsEditing(null)}
                                className="btn-secondary flex items-center gap-1.5 py-1 px-3 text-xs"
                              >
                                <X size={12} />
                                Cancel
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={() => handleSaveChanges(tx.id)}
                                className="btn-accent flex items-center gap-1.5 py-1 px-3 text-xs"
                              >
                                {isSaving ? (
                                  <RefreshCw className="animate-spin" size={12} />
                                ) : (
                                  <Save size={12} />
                                )}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* View Details Drawer */
                          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Column 1 */}
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <Clock size={13} />
                                <span>System Timestamp: {formatTimestampFull(tx.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <FileText size={13} />
                                <span>Sender Account: {tx.from_name} ({tx.from_account})</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <FileText size={13} />
                                <span>Receiver Account: {tx.to_name} ({tx.to_account})</span>
                              </div>
                            </div>

                            {/* Column 2 */}
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <Shield size={13} />
                                <span className="font-mono">Idempotency: {tx.idempotency_key || 'seed_transaction'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                <CheckCircle2 size={13} />
                                <span className="font-mono">UUID: {tx.id}</span>
                              </div>
                              {tx.note && (
                                <div className="text-xs flex gap-2" style={{ color: 'var(--color-text-muted)' }}>
                                  <span className="font-semibold flex-shrink-0">Transaction Memo:</span>
                                  <span className="italic">"{tx.note}"</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
    </motion.div>
  );
};

export default TransactionsPage;
