/**
 * TransactionRow.tsx — Verdant Finance: Single transaction list item
 *
 * Each row enters with a Framer Motion stagger animation (parent controls delay).
 * Layout: [amount direction icon] [from→to + note] [timestamp] [status badge]
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react';
import type { Transaction } from '../../types';
import { StatusBadge } from './StatusBadge';
import { formatCurrency } from '../../utils/currency';

interface TransactionRowProps {
  transaction: Transaction;
  /** Used to stagger entry animations */
  index: number;
  /** The "current user" account id — determines if this is a debit or credit */
  viewerAccountId?: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  index,
  viewerAccountId,
}) => {
  const { from_account, from_name, to_name, amount, status, note, created_at } =
    transaction;

  const isDebit =
    viewerAccountId === undefined || from_account === viewerAccountId;
  const isFailed = status === 'failed';
  const isPending = status === 'pending';

  const amountColor = isFailed
    ? 'var(--color-terra)'
    : isPending
    ? 'var(--color-text-muted)'
    : isDebit
    ? 'var(--color-terra)'
    : 'var(--color-green)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.04, 0.32), // cap stagger at 320ms
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex items-center gap-4 py-4"
      style={{
        borderBottom: '1px solid var(--color-border)',
        opacity: isFailed ? 0.75 : 1,
      }}
    >
      {/* Direction icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: 36,
          height: 36,
          background: isFailed
            ? 'var(--color-terra-light)'
            : isDebit
            ? 'var(--color-terra-light)'
            : 'var(--color-green-light)',
        }}
      >
        {isFailed ? (
          <AlertCircle size={16} color="var(--color-terra)" strokeWidth={1.75} />
        ) : isDebit ? (
          <ArrowUpRight size={16} color="var(--color-terra)" strokeWidth={1.75} />
        ) : (
          <ArrowDownLeft size={16} color="var(--color-green)" strokeWidth={1.75} />
        )}
      </div>

      {/* Party names + note */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: 'var(--color-text)' }}
        >
          {from_name}{' '}
          <span style={{ color: 'var(--color-text-muted)' }}>→</span>{' '}
          {to_name}
        </p>
        {note && (
          <p
            className="text-xs mt-0.5 truncate"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {note}
          </p>
        )}
        <p
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {formatTimestamp(created_at)}
        </p>
      </div>

      {/* Amount + status — right-aligned */}
      <div className="flex-shrink-0 text-right">
        <p
          className="text-sm font-medium tabular-nums"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            color: amountColor,
            fontSize: '15px',
          }}
        >
          {isDebit && !isFailed ? '−' : isFailed ? '' : '+'}
          {formatCurrency(amount)}
        </p>
        <div className="mt-1.5">
          <StatusBadge status={status} />
        </div>
      </div>
    </motion.div>
  );
};

export default TransactionRow;
