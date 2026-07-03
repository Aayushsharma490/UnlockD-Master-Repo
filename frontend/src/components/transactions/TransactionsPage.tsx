/**
 * TransactionsPage.tsx — Full History with Search, Filter, Sort, & Detail Drawer
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../hooks/useTransactions';
import { useAccounts } from '../../hooks/useAccounts';
import { formatCurrency } from '../../utils/currency';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, FileText, CheckCircle2, Shield } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export const TransactionsPage: React.FC = () => {
  const { user } = useAuth();
  const { transactions, isLoading, error } = useTransactions();
  const { accounts } = useAccounts();

  // Search & Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Detail drawer / expanded row state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Compute viewer's own accounts list to determine incoming vs outgoing
  const ownedAccountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);

  // UI compactness density setting
  const isCompact = useMemo(() => {
    return user?.preferences?.compact ?? (localStorage.getItem('compact_density') === 'true');
  }, [user]);

  // Filter & Sort logic
  const processedTransactions = useMemo(() => {
    let list = [...transactions];

    // 1. Search Filter
    if (search.trim() !== '') {
      const query = search.toLowerCase();
      list = list.filter((tx) =>
        tx.from_name.toLowerCase().includes(query) ||
        tx.to_name.toLowerCase().includes(query) ||
        (tx.note && tx.note.toLowerCase().includes(query))
      );
    }

    // 2. Status Filter
    if (statusFilter !== 'all') {
      list = list.filter((tx) => tx.status === statusFilter);
    }

    // 3. Sorting
    list.sort((a, b) => {
      if (sortField === 'date') {
        const d1 = new Date(a.created_at).getTime();
        const d2 = new Date(b.created_at).getTime();
        return sortOrder === 'desc' ? d2 - d1 : d1 - d2;
      } else {
        return sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
      }
    });

    return list;
  }, [transactions, search, statusFilter, sortField, sortOrder]);

  // Pagination (20 per page)
  const PAGE_SIZE = 20;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedTransactions.slice(start, start + PAGE_SIZE);
  }, [processedTransactions, currentPage]);

  const totalPages = Math.max(1, Math.ceil(processedTransactions.length / PAGE_SIZE));

  const handleRowClick = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
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
      {/* Title */}
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
          Detailed record of all money moves. Click a row to expand forensic debug details.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
        {/* Search */}
        <div className="sm:col-span-2 relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[--color-text-faint]"
          />
          <input
            type="text"
            className="verdant-input pl-10"
            placeholder="Search counterparties or notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Status */}
        <div>
          <select
            className="verdant-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Status"
          >
            <option value="all">All Statuses</option>
            <option value="success">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Sort Order Toggle */}
        <div className="flex gap-2">
          <select
            className="verdant-input flex-1"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as 'date' | 'amount')}
            aria-label="Sort Field"
          >
            <option value="date">Sort by Date</option>
            <option value="amount">Sort by Amount</option>
          </select>
          <button
            onClick={() => setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'))}
            className="btn-secondary px-3"
            aria-label="Toggle Sort Direction"
          >
            {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[--color-border] flex justify-between items-center bg-white/30">
          <span className="text-xs font-semibold tracking-wider uppercase text-[--color-text-muted]">
            Showing {processedTransactions.length} transaction{processedTransactions.length !== 1 && 's'}
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
          ) : paginatedTransactions.length === 0 ? (
            <div className="p-12 text-center text-[--color-text-muted]">
              No transactions match your search parameters.
            </div>
          ) : (
            paginatedTransactions.map((tx) => {
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

              // Counterparty letter
              const counterpartyName = isDebit ? tx.to_name : tx.from_name;
              const avatarLetter = counterpartyName.charAt(0).toUpperCase();

              return (
                <div key={tx.id} className="transition-colors hover:bg-white/10">
                  {/* Row content */}
                  <div
                    onClick={() => handleRowClick(tx.id)}
                    className="flex items-center gap-4 cursor-pointer select-none"
                    style={{
                      padding: isCompact ? '10px 24px' : '16px 24px',
                    }}
                  >
                    {/* Initial Circle */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{
                        background: 'rgba(28,27,25,0.06)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {avatarLetter}
                    </div>

                    {/* Parties & note */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {tx.from_name} → {tx.to_name}
                        </span>
                        {tx.note && (
                          <span
                            className="text-xs truncate px-2 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(28,27,25,0.04)',
                              color: 'var(--color-text-muted)',
                              maxWidth: '150px',
                            }}
                          >
                            {tx.note}
                          </span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
                        {formatTimestampShort(tx.created_at)}
                      </span>
                    </div>

                    {/* Amount & Badge */}
                    <div className="text-right">
                      <span
                        className="text-sm font-medium tabular-nums font-display"
                        style={{ color: amountColor, fontSize: '16px' }}
                      >
                        {directionSign}
                        {formatCurrency(tx.amount)}
                      </span>
                      <div className="mt-1">
                        <StatusBadge status={tx.status} />
                      </div>
                    </div>
                  </div>

                  {/* Expandable forensic details drawer */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden bg-white/20 border-t border-[--color-border] px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
                      >
                        {/* Transaction Detail Details */}
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock size={13} />
                            <span>System Timestamp: {formatTimestampFull(tx.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <FileText size={13} />
                            <span>Sender Account ID: {tx.from_account}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <FileText size={13} />
                            <span>Receiver Account ID: {tx.to_account}</span>
                          </div>
                        </div>

                        {/* Idempotency and status details */}
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <Shield size={13} />
                            <span className="font-mono">Idempotency Key: {tx.idempotency_key || 'seed_transaction'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <CheckCircle2 size={13} />
                            <span className="font-mono">UUID: {tx.id}</span>
                          </div>
                          {tx.note && (
                            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              <span>Memo: {tx.note}</span>
                            </div>
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

      {/* Pagination controls */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 px-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
