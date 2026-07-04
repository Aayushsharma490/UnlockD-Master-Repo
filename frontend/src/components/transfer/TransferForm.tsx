/**
 * TransferForm.tsx — Money transfer form with category support, scheduled transfers, confirmation modal, and budget toasts
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Check } from 'lucide-react';
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
  ) => () => void;
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
  onShowToast?: (message: string) => void;
}

export const TransferForm: React.FC<TransferFormProps> = ({
  accounts,
  onOptimisticTransfer,
  onReconcile,
  onTransactionAdded,
  onTransactionStatusUpdate,
  onClose,
  onShowToast,
}) => {
  // ── Form field state ───────────────────────────────────────────────────────
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('Uncategorized');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState<'once' | 'weekly' | 'monthly'>('once');
  const [nextRunDate, setNextRunDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  
  // ── Confirmation state ─────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  
  // ── Multi-user recipients state ────────────────────────────────────────────
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Fetch recipients on mount
  useEffect(() => {
    fetch('/api/accounts/recipients')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data.recipients) {
          setRecipients(data.recipients);
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
    if (category === 'Uncategorized') return 'Please select an expense category.';
    if (amountPaise === null || amountPaise <= 0) return 'Enter a valid amount.';
    if (fromAccount && amountPaise > fromAccount.balance) {
      return `Insufficient balance. Available: ₹${(fromAccount.balance / 100).toLocaleString('en-IN')}`;
    }
    if (frequency !== 'once') {
      const parsedDate = new Date(nextRunDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(parsedDate.getTime()) || parsedDate.getTime() < today.getTime()) {
        return 'Next run date must be today or in the future.';
      }
    }
    return null;
  }, [fromAccountId, toAccountId, category, amountPaise, fromAccount, frequency, nextRunDate]);

  const isLocked = submitState === 'submitting';

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async () => {
      setShowConfirm(false);
      if (isLocked || validationError || amountPaise === null) return;

      const ownToAccount = accounts.find((a) => a.id === toAccountId);
      const recipientToAccount = recipients.find((r) => r.id === toAccountId);
      
      if (!fromAccount || (!ownToAccount && !recipientToAccount)) return;
      
      const toName = ownToAccount 
        ? ownToAccount.name 
        : `${recipientToAccount!.owner_name} (${recipientToAccount!.account_name})`;

      setSubmitState('submitting');

      if (frequency !== 'once') {
        // Scheduled transfer execution
        try {
          const res = await fetch('/api/scheduled-transfers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from_account: fromAccountId,
              to_account: toAccountId,
              amount: amountPaise / 100, // Passed as Rupees value
              frequency,
              next_run_date: nextRunDate,
            }),
          });

          const data = await res.json();

          if (res.ok) {
            setResultMessage(`Successfully scheduled ₹${(amountPaise / 100).toLocaleString('en-IN')} transfer to ${toName} (${frequency}).`);
            setSubmitState('success');
          } else {
            setResultMessage(data.error ?? 'Failed to schedule transfer.');
            setSubmitState('failed');
          }
        } catch (err) {
          setResultMessage('Network error — please check connection.');
          setSubmitState('failed');
        }
        return;
      }

      // Immediate transfer (once)
      // Step 1: Optimistic update
      const rollback = onOptimisticTransfer(fromAccountId, toAccountId, amountPaise);

      // Step 2: Add pending transaction
      const tempTxId = `temp_${uuidv4()}`;
      onTransactionAdded({
        id: tempTxId,
        from_account: fromAccountId,
        to_account: toAccountId,
        from_name: fromAccount.name,
        to_name: toName,
        amount: amountPaise,
        category,
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
            category,
            note: note || undefined,
            idempotency_key: idempotencyKey,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          // Reconcile balances
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

          // Trigger budget alerts if they cross 80% or 100%
          if (data.budgetAlert && onShowToast) {
            const { spent, limit_amount, percentUsed } = data.budgetAlert;
            if (percentUsed >= 80) {
              const msg = `You've used ${percentUsed}% of your ${category} budget (₹${(spent / 100).toLocaleString('en-IN')} / ₹${(limit_amount / 100).toLocaleString('en-IN')})`;
              onShowToast(msg);
            }
          }
        } else {
          rollback();
          onTransactionStatusUpdate(tempTxId, 'failed', data.transaction?.id);
          setResultMessage(data.error ?? 'Transfer could not be completed.');
          setSubmitState('failed');
        }
      } catch (networkErr) {
        rollback();
        onTransactionStatusUpdate(tempTxId, 'failed');
        setResultMessage('Network error — please check connection.');
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
      category,
      note,
      idempotencyKey,
      frequency,
      nextRunDate,
      onOptimisticTransfer,
      onReconcile,
      onTransactionAdded,
      onTransactionStatusUpdate,
      onShowToast,
    ]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError || !amountInput) return;
    setShowConfirm(true);
  };

  const handleReset = useCallback(() => {
    setFromAccountId(accounts[0]?.id ?? '');
    setToAccountId(accounts[1]?.id ?? (recipients[0]?.id ?? ''));
    setAmountInput('');
    setCategory('Uncategorized');
    setNote('');
    setFrequency('once');
    setShowConfirm(false);
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

  // Derived display details for confirmation modal
  const targetAccountName = useMemo(() => {
    const own = accounts.find(a => a.id === toAccountId);
    if (own) return own.name;
    const rec = recipients.find(r => r.id === toAccountId);
    return rec ? `${rec.owner_name} (${rec.account_name})` : 'Unknown';
  }, [accounts, recipients, toAccountId]);

  return (
    <AnimatePresence mode="wait">
      {showConfirm ? (
        <motion.div
          key="confirmation-modal"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex flex-col gap-6 px-6 py-6"
        >
          <div className="text-center">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--color-text)', margin: '0 0 8px 0' }}>
              Confirm Transfer Details
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)', margin: 0 }}>
              Please review details before establishing this transfer.
            </p>
          </div>

          <div className="glass-card flex flex-col gap-3 p-4 bg-white/20 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
              <span className="text-[--color-text-muted]">From Account</span>
              <span className="font-semibold text-[--color-text]">{fromAccount?.name}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
              <span className="text-[--color-text-muted]">Destination</span>
              <span className="font-semibold text-[--color-text]">{targetAccountName}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
              <span className="text-[--color-text-muted]">Amount</span>
              <span className="font-bold text-[--color-green]" style={{ fontSize: '15px' }}>
                ₹{parseFloat(amountInput).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
              <span className="text-[--color-text-muted]">Category</span>
              <span className="font-semibold text-[--color-text]">{category}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
              <span className="text-[--color-text-muted]">Frequency</span>
              <span className="font-semibold text-[--color-text] uppercase tracking-wider text-xs bg-[--color-green-light] text-[--color-green] px-2 py-0.5 rounded">
                {frequency}
              </span>
            </div>
            {frequency !== 'once' && (
              <div className="flex justify-between items-center py-1 border-b border-[--color-border]/50">
                <span className="text-[--color-text-muted]">Next Run Date</span>
                <span className="font-semibold text-[--color-text]">{nextRunDate}</span>
              </div>
            )}
            {note && (
              <div className="flex flex-col gap-1 py-1">
                <span className="text-[--color-text-muted]">Note</span>
                <span className="font-medium text-[--color-text] italic bg-white/40 p-2 rounded text-xs">"{note}"</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={handleSubmit}
              className="btn-primary w-full"
              style={{ padding: '12px' }}
            >
              <Check size={16} />
              Confirm & Send
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="btn-secondary w-full"
              style={{ padding: '12px' }}
            >
              Cancel & Modify
            </button>
          </div>
        </motion.div>
      ) : (submitState === 'success' || submitState === 'failed') ? (
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
          onSubmit={handleFormSubmit}
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

          {/* Frequency selector */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="frequency" className="eyebrow" style={{ display: 'block' }}>
              Frequency
            </label>
            <select
              id="frequency"
              className="verdant-input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              disabled={isLocked}
            >
              <option value="once">Once (Immediate)</option>
              <option value="weekly">Weekly (Recurring)</option>
              <option value="monthly">Monthly (Recurring)</option>
            </select>
          </div>

          {/* Next run date for scheduled */}
          {frequency !== 'once' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="next-run-date" className="eyebrow" style={{ display: 'block' }}>
                Next Run Date
              </label>
              <input
                id="next-run-date"
                type="date"
                className="verdant-input"
                value={nextRunDate}
                onChange={(e) => setNextRunDate(e.target.value)}
                disabled={isLocked}
              />
            </div>
          )}

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="transfer-category" className="eyebrow" style={{ display: 'block' }}>
              Category
            </label>
            <select
              id="transfer-category"
              className="verdant-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isLocked}
            >
              <option value="Uncategorized">Select a Category</option>
              <option value="Food">Food</option>
              <option value="Transport">Transport</option>
              <option value="Shopping">Shopping</option>
              <option value="Bills">Bills</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Other">Other</option>
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
                {frequency === 'once' ? 'Transfer' : 'Schedule Transfer'}
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
