/**
 * EmptyState.tsx — Verdant Finance: Empty transaction history state
 *
 * Intentionally editorial — not a generic "No data" placeholder.
 * Uses a typographic moment with a light SVG accent to feel intentional.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight } from 'lucide-react';

interface EmptyStateProps {
  onTransferClick?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onTransferClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    className="flex flex-col items-center justify-center py-20 px-8 text-center"
  >
    {/* Icon container */}
    <div
      className="flex items-center justify-center rounded-2xl mb-6"
      style={{
        width: 56,
        height: 56,
        background: 'rgba(47, 79, 62, 0.06)',
        border: '1px solid rgba(47, 79, 62, 0.12)',
      }}
    >
      <ArrowLeftRight
        size={22}
        color="var(--color-green)"
        strokeWidth={1.5}
      />
    </div>

    {/* Copy — editorial, not generic */}
    <p className="eyebrow mb-3">No transactions yet</p>
    <p
      className="mb-2 text-2xl"
      style={{
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontWeight: 400,
        color: 'var(--color-text)',
        letterSpacing: '-0.01em',
      }}
    >
      Your ledger is clean.
    </p>
    <p
      className="text-sm max-w-xs leading-relaxed"
      style={{ color: 'var(--color-text-muted)' }}
    >
      Every transfer you make will appear here — with timestamp,
      status, and full trail. Verdant keeps the record so you don't have to.
    </p>

    {onTransferClick && (
      <button
        className="btn-primary mt-8"
        onClick={onTransferClick}
        id="empty-state-transfer-btn"
      >
        Make your first transfer
      </button>
    )}
  </motion.div>
);

export default EmptyState;
