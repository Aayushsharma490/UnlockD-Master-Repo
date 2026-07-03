/**
 * useTransactions.ts — Verdant Finance: Transaction history state
 *
 * Listens to useAuth's user state to automatically refetch when the user logs in.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Transaction, TransactionStatus } from '../types';
import { useAuth } from '../context/AuthContext';

interface UseTransactionsReturn {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  addPendingTransaction: (tx: Omit<Transaction, 'status'>) => string;
  updateTransactionStatus: (
    tempId: string,
    status: TransactionStatus,
    realId?: string
  ) => void;
  refetch: () => void;
}

export function useTransactions(): UseTransactionsReturn {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/transactions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Refetch when user logs in or out
  useEffect(() => {
    if (user) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setError(null);
      setIsLoading(false);
    }
  }, [user, fetchTransactions]);

  const addPendingTransaction = useCallback(
    (tx: Omit<Transaction, 'status'>): string => {
      const pendingTx: Transaction = { ...tx, status: 'pending' };
      setTransactions((prev) => [pendingTx, ...prev]);
      return tx.id;
    },
    []
  );

  const updateTransactionStatus = useCallback(
    (tempId: string, status: TransactionStatus, realId?: string) => {
      setTransactions((prev) =>
        prev.map((tx) => {
          if (tx.id !== tempId) return tx;
          return {
            ...tx,
            status,
            id: realId || tx.id,
          };
        })
      );
    },
    []
  );

  return {
    transactions,
    isLoading,
    error,
    addPendingTransaction,
    updateTransactionStatus,
    refetch: fetchTransactions,
  };
}
