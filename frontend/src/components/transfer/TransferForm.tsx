/**
 * TransferForm.tsx — Money transfer form with multi-user support
 *
 * Handles the complete transfer flow, allowing transfers to either the user's
 * own portfolios (Checking/Savings) or other cultivators in the Verdant system.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { Account, SubmitState, Transaction } from '../../types';
import { SuccessConfirmation } from './SuccessConfirmation';
import { rupeesToPaise } from '../../utils/currency';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { v4 as uuidv4 } from 'uuid';

interface Recipient {
  id: string;
  account_name: string;
  owner_name: string;
}

interface TransferFormProps {
  accounts: Account[];
  onOptimisticTransfer: (
    fromId: string,
    toId: string,
    amountPaise: number
  ) => () => void; // returns rollback fn
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
  onClose: () => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({
  accounts,
  onOptimisticTransfer,
  onReconcile,
  onTransactionAdded,
  onTransactionStatusUpdate,
  onClose,
}) => {
  // ── Form field state ───────────────────────────────────────────────────────
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  
  // ── Multi-user recipients state ────────────────────────────────────────────
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Fetch all recipients belonging to other cultivators on form mount
  useEffect(() => {
    fetch('/api/accounts/recipients')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data.recipients) {
          setRecipients(data.recipients);
          // If the user has only 1 account, default selection to the first recipient
          if (accounts.length <= 1 && data.recipients.length > 0) {
            setToAccountId(data.recipients[0].id);
          }
        }
      })
      .catch((err) => console.warn('[TransferForm] Could not fetch other cultivators:', err));
  }, [accounts]);

  // ── Submission state ───────────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [resultMessage, setResultMessage] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    generateIdempotencyKey()
  );

  // ── Derived validation ─────────────────────────────────────────────────────
  const fromAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId),
    [accounts, fromAccountId]
  );

  const amountPaise = useMemo(
    () => rupeesToPaise(amountInput),
    [amountInput]
  );

  const validationError = useMemo((): string | null => {
    if (!fromAccountId || !toAccountId) return 'Select both accounts.';
    if (fromAccountId === toAccountId) return 'Source and destination must differ.';
    if (amountPaise === null || amountPaise <= 0) return 'Enter a valid amount.';
    if (fromAccount && amountPaise > fromAccount.balance) {
      return `Insufficient balance. Available: ₹${(fromAccount.balance / 100).toLocaleString('en-IN')}`;
    }
    return null;
  }, [fromAccountId, toAccountId, amountPaise, fromAccount]);

  const isLocked = submitState === 'submitting';

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (isLocked || validationError || amountPaise === null) return;

      // Find destination name (could be own account or recipient account)
      const ownToAccount = accounts.find((a) => a.id === toAccountId);
      const recipientToAccount = recipients.find((r) => r.id === toAccountId);
      
      if (!fromAccount || (!ownToAccount && !recipientToAccount)) return;
      
      const toName = ownToAccount 
        ? ownToAccount.name 
        : `${recipientToAccount!.owner_name} (${recipientToAccount!.account_name})`;

      setSubmitState('submitting');

      // Step 1: Optimistic update
      const rollback = onOptimisticTransfer(fromAccountId, toAccountId, amountPaise);

      // Step 2: Add a 'pending' transaction to history immediately
      const tempTxId = `temp_${uuidv4()}`;
      onTransactionAdded({
        id: tempTxId,
        from_account: fromAccountId,
        to_account: toAccountId,
        from_name: fromAccount.name,
        to_name: toName,
        amount: amountPaise,
        note: note || null,
        created_at: new Date().toISOString(),
      });

      // Step 3: POST to backend
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_account: fromAccountId,
            to_account: toAccountId,
            amount: amountPaise,
            note: note || undefined,
            idempotency_key: idempotencyKey,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          // Step 4a: Success — reconcile balance
          const tx = data.transaction;
          if (tx.from_balance_after !== undefined) {
            onReconcile(
              fromAccountId,
              toAccountId,
              tx.from_balance_after,
              tx.to_balance_after !== undefined ? tx.to_balance_after : 0
            );
          }
          onTransactionStatusUpdate(tempTxId, 'success', tx.id);
          setResultMessage(`₹${(amountPaise / 100).toLocaleString('en-IN')} sent to ${toName}.`);
          setSubmitState('success');
        } else {
          // Step 4b: Server rejected — roll back
          rollback();
          onTransactionStatusUpdate(tempTxId, 'failed', data.transaction?.id);
          setResultMessage(data.error ?? 'Transfer could not be completed.');
          setSubmitState('failed');
        }
      } catch (networkErr) {
        rollback();
        onTransactionStatusUpdate(tempTxId, 'failed');
        setResultMessage('Network error — please check your connection and try again.');
        setSubmitState('failed');
      }
    },
    [
      isLocked,
      validationError,
      amountPaise,
      fromAccountId,
      toAccountId,
      fromAccount,
      accounts,
      recipients,
      note,
      idempotencyKey,
      onOptimisticTransfer,
      onReconcile,
      onTransactionAdded,
      onTransactionStatusUpdate,
    ]
  );

  const handleReset = useCallback(() => {
    setFromAccountId(accounts[0]?.id ?? '');
    setToAccountId(accounts[1]?.id ?? (recipients[0]?.id ?? ''));
    setAmountInput('');
    setNote('');
    setSubmitState('idle');
    setResultMessage('');
    setIdempotencyKey(generateIdempotencyKey());
  }, [accounts, recipients]);

  const handleDismiss = useCallback(() => {
    if (submitState === 'success') {
      onClose();
    } else {
      handleReset();
    }
  }, [submitState, onClose, handleReset]);

  return (
    <AnimatePresence mode="wait">
      {(submitState === 'success' || submitState === 'failed') ? (
        <SuccessConfirmation
          key="result"
          state={submitState}
          message={resultMessage}
          onDismiss={handleDismiss}
        />
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5 px-6 py-6"
          aria-label="Transfer funds form"
        >
          {/* From account */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="from-account" className="eyebrow" style={{ display: 'block' }}>
              From
            </label>
            <select
              id="from-account"
              className="verdant-input"
              value={fromAccountId}
              onChange={(e) => {
                setFromAccountId(e.target.value);
                // Prevent selecting the same account in 'To' if it matches
                if (e.target.value === toAccountId) {
                  const remaining = accounts.find((a) => a.id !== e.target.value);
                  if (remaining) {
                    setToAccountId(remaining.id);
                  } else if (recipients.length > 0) {
                    setToAccountId(recipients[0].id);
                  }
                }
              }}
              disabled={isLocked}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (₹{(acc.balance / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                </option>
              ))}
            </select>
          </div>

          {/* To account */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="to-account" className="eyebrow" style={{ display: 'block' }}>
              To
            </label>
            <select
              id="to-account"
              className="verdant-input"
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              disabled={isLocked}
            >
              <optgroup label="My Portfolios">
                {accounts
                  .filter((a) => a.id !== fromAccountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (₹{(acc.balance / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                    </option>
                  ))}
              </optgroup>
              {recipients.length > 0 && (
                <optgroup label="Other Cultivators">
                  {recipients.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.owner_name} — {rec.account_name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="amount" className="eyebrow" style={{ display: 'block' }}>
              Amount (₹)
            </label>
            <input
              id="amount"
              type="number"
              className="verdant-input"
              placeholder="0.00"
              min="0.01"
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={isLocked}
              inputMode="decimal"
            />
            {fromAccount && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Available: ₹{(fromAccount.balance / 100).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            )}
          </div>

          {/* Optional note */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="transfer-note" className="eyebrow" style={{ display: 'block' }}>
              Note <span style={{ color: 'var(--color-text-faint)', fontWeight: 400, letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              id="transfer-note"
              type="text"
              className="verdant-input"
              placeholder="What's this for?"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isLocked}
            />
          </div>

          {/* Validation error */}
          <AnimatePresence>
            {validationError && amountInput !== '' && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-sm"
                style={{ color: 'var(--color-terra)' }}
              >
                {validationError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <button
            type="submit"
            className="btn-primary w-full mt-1"
            id="transfer-submit-btn"
            disabled={isLocked || !!validationError || !amountInput}
          >
            {isLocked ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing…
              </>
            ) : (
              <>
                Transfer
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Cancel */}
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={onClose}
            disabled={isLocked}
            id="transfer-cancel-btn"
          >
            Cancel
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
};

export default TransferForm;
