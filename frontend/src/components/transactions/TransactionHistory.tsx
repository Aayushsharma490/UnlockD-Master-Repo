/**
 * TransactionHistory.tsx — Verdant Finance: Full transaction history list
 *
 * Section wrapper for the transaction list with:
 * - GSAP scroll-triggered reveal for the section header
 * - Framer Motion staggered entry for each row (via TransactionRow)
 * - Empty state when no transactions exist
 * - Loading skeleton while fetching
 */

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Transaction } from '../../types';
import { TransactionRow } from './TransactionRow';
import { EmptyState } from './EmptyState';

gsap.registerPlugin(ScrollTrigger);

interface TransactionHistoryProps {
  transactions: Transaction[];
  isLoading: boolean;
  error?: string | null;
  onTransferClick?: () => void;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const SkeletonRow: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="flex items-center gap-4 py-4"
    style={{
      borderBottom: '1px solid var(--color-border)',
      animationDelay: `${index * 80}ms`,
    }}
  >
    <div
      className="flex-shrink-0 rounded-xl"
      style={{
        width: 36,
        height: 36,
        background: 'rgba(28,27,25,0.05)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
    <div className="flex-1">
      <div
        className="rounded mb-1.5"
        style={{
          height: 13,
          width: '55%',
          background: 'rgba(28,27,25,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        className="rounded"
        style={{
          height: 11,
          width: '30%',
          background: 'rgba(28,27,25,0.04)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
    </div>
    <div className="text-right">
      <div
        className="rounded mb-1.5 ml-auto"
        style={{
          height: 13,
          width: 70,
          background: 'rgba(28,27,25,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        className="rounded ml-auto"
        style={{
          height: 20,
          width: 60,
          background: 'rgba(28,27,25,0.04)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
    </div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  isLoading,
  error,
  onTransferClick,
}) => {
  const headerRef = useRef<HTMLDivElement>(null);

  // GSAP scroll-triggered reveal for the section header
  useEffect(() => {
    if (!headerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.tx-header-reveal',
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: {
            trigger: headerRef.current,
            start: 'top 90%',
            once: true,
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <section className="glass-card" aria-label="Transaction history">
      {/* Section header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-6 pt-6 pb-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div>
          <p className="eyebrow tx-header-reveal">History</p>
          <h2
            className="tx-header-reveal mt-1"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '22px',
              fontWeight: 400,
              color: 'var(--color-text)',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            All Transactions
          </h2>
        </div>

        {transactions.length > 0 && (
          <span
            className="tx-header-reveal text-sm px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(28,27,25,0.05)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {transactions.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-6 pb-6">
        {error ? (
          // Error state — /api/transactions unreachable
          <div
            className="py-10 text-center"
            role="alert"
          >
            <p className="text-sm" style={{ color: 'var(--color-terra)' }}>
              Could not load transactions — {error}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
              Is the backend running at :3000?
            </p>
          </div>
        ) : isLoading ? (
          // Skeleton loading state
          Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} index={i} />)
        ) : transactions.length === 0 ? (
          <EmptyState onTransferClick={onTransferClick} />
        ) : (
          transactions.map((tx, index) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              index={index}
            />
          ))
        )}
      </div>
    </section>
  );
};

export default TransactionHistory;
