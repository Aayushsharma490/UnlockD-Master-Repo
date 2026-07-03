/**
 * StatusBadge.tsx — Verdant Finance: Transaction status pill
 */

import React from 'react';
import type { TransactionStatus } from '../../types';

interface StatusBadgeProps {
  status: TransactionStatus;
}

const STATUS_CONFIG: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  success: { label: 'Completed', className: 'badge-success' },
  pending: { label: 'Pending',   className: 'badge-pending' },
  failed:  { label: 'Failed',    className: 'badge-failed'  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${className}`}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
