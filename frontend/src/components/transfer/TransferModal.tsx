/**
 * TransferModal.tsx — Verdant Finance: Transfer sheet/modal wrapper
 *
 * On mobile (< 768px): slides up from the bottom as a full-width sheet.
 * On desktop (≥ 768px): appears as a centered overlay modal.
 *
 * Uses Framer Motion for entrance/exit animations.
 * The backdrop closes the modal on click.
 *
 * Note on responsive animation: we use a CSS media query approach via
 * a custom hook rather than checking window.innerWidth inline — that would
 * be stale on re-renders after a resize.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Account, Transaction } from '../../types';
import { TransferForm } from './TransferForm';

interface TransferModalProps {
  isOpen: boolean;
  accounts: Account[];
  onClose: () => void;
  onOptimisticTransfer: (fromId: string, toId: string, amount: number) => () => void;
  onReconcile: (
    fromId: string,
    toId: string,
    fromBalanceAfter: number,
    toBalanceAfter: number
  ) => void;
  onTransactionAdded: (tx: Omit<Transaction, 'status'>) => string;
  onTransactionStatusUpdate: (
    tempId: string,
    status: 'success' | 'failed',
    realId?: string
  ) => void;
}

/** Returns true when the viewport is at least 768px wide — reactively updates on resize. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  accounts,
  onClose,
  onOptimisticTransfer,
  onReconcile,
  onTransactionAdded,
  onTransactionStatusUpdate,
}) => {
  const isDesktop = useIsDesktop();

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Desktop modal styles
  const desktopPanelStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '440px',
    maxWidth: '95vw',
    maxHeight: '90dvh',
    borderRadius: '20px',
    background: '#FDFCF9',
    boxShadow: '0 24px 80px rgba(28,27,25,0.15)',
    zIndex: 50,
    overflowY: 'auto',
  };

  // Mobile sheet styles (bottom slide-up)
  const mobilePanelStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '92dvh',
    borderRadius: '20px 20px 0 0',
    background: '#FDFCF9',
    boxShadow: '0 -8px 40px rgba(28,27,25,0.12)',
    zIndex: 50,
    overflowY: 'auto',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            id="transfer-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(28, 27, 25, 0.4)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Transfer funds"
            style={isDesktop ? desktopPanelStyle : mobilePanelStyle}
            initial={isDesktop
              ? { opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }
              : { y: '100%' }
            }
            animate={isDesktop
              ? { opacity: 1, scale: 1, y: '-50%', x: '-50%' }
              : { y: 0 }
            }
            exit={isDesktop
              ? { opacity: 0, scale: 0.95, y: '-48%', x: '-50%' }
              : { y: '100%' }
            }
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                position: 'sticky',
                top: 0,
                background: '#FDFCF9',
                zIndex: 1,
              }}
            >
              <div>
                <p className="eyebrow">Verdant</p>
                <h2
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontSize: '20px',
                    fontWeight: 400,
                    color: 'var(--color-text)',
                    letterSpacing: '-0.01em',
                    margin: 0,
                    marginTop: '2px',
                  }}
                >
                  New Transfer
                </h2>
              </div>
              <button
                onClick={onClose}
                id="transfer-modal-close-btn"
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border-mid)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                }}
                aria-label="Close transfer modal"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <TransferForm
              accounts={accounts}
              onClose={onClose}
              onOptimisticTransfer={onOptimisticTransfer}
              onReconcile={onReconcile}
              onTransactionAdded={onTransactionAdded}
              onTransactionStatusUpdate={onTransactionStatusUpdate}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TransferModal;
