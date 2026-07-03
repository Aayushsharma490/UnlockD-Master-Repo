/**
 * AccountCard.tsx — Verdant Finance: Glassmorphic account balance card
 *
 * Each card shows one account's name, balance (with animated counter),
 * and a subtle indicator for whether it's selected as the active account.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import type { Account } from '../../types';
import { BalanceCounter } from './BalanceCounter';

interface AccountCardProps {
  account: Account;
  isSelected?: boolean;
  onClick?: () => void;
  /** Index used for staggered entry animation */
  index?: number;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isSelected = false,
  onClick,
  index = 0,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      duration: 0.5,
      delay: index * 0.08,
      ease: [0.22, 1, 0.36, 1],
    }}
    whileTap={{ scale: onClick ? 0.98 : 1 }}
    onClick={onClick}
    className={`glass-card glass-card-hover relative overflow-hidden p-6 cursor-${
      onClick ? 'pointer' : 'default'
    } select-none transition-all ${
      isSelected
        ? 'ring-1 ring-[--color-green] ring-opacity-40'
        : ''
    }`}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    aria-pressed={onClick ? isSelected : undefined}
  >
    {/* Subtle gradient wash on the selected state */}
    {isSelected && (
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(47,79,62,0.04) 0%, transparent 60%)',
        }}
      />
    )}

    {/* Header row */}
    <div className="flex items-start justify-between mb-5">
      <div>
        <p className="eyebrow mb-1">Account</p>
        <h3
          className="text-base font-medium leading-snug"
          style={{ color: 'var(--color-text)' }}
        >
          {account.name}
        </h3>
      </div>
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 36,
          height: 36,
          background: isSelected
            ? 'var(--color-green-light)'
            : 'rgba(28,27,25,0.05)',
        }}
      >
        <Wallet
          size={16}
          color={isSelected ? 'var(--color-green)' : 'var(--color-text-muted)'}
          strokeWidth={1.75}
        />
      </div>
    </div>

    {/* Balance figure — the editorial moment */}
    <div>
      <p className="eyebrow mb-2">Available balance</p>
      <BalanceCounter balance={account.balance} />
    </div>

    {/* Account id — dimmed, monospace, for traceability */}
    <p
      className="mt-4 text-xs font-mono tracking-wide"
      style={{ color: 'var(--color-text-faint)' }}
    >
      {account.id}
    </p>
  </motion.div>
);

export default AccountCard;
