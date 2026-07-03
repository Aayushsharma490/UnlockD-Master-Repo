/**
 * useAccounts.ts — Verdant Finance: Account state with optimistic updates
 *
 * Listens to useAuth's user state to automatically refetch when the user logs in.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Account } from '../types';
import { useAuth } from '../context/AuthContext';

interface UseAccountsReturn {
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
  applyOptimisticTransfer: (
    fromAccountId: string,
    toAccountId: string,
    amountPaise: number
  ) => () => void;
  reconcileBalances: (
    fromAccountId: string,
    toAccountId: string,
    fromBalanceAfter: number,
    toBalanceAfter: number
  ) => void;
  refetch: () => void;
}

export function useAccounts(): UseAccountsReturn {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Refetch when user logs in or out
  useEffect(() => {
    if (user) {
      fetchAccounts();
    } else {
      setAccounts([]);
      setError(null);
      setIsLoading(false);
    }
  }, [user, fetchAccounts]);

  const applyOptimisticTransfer = useCallback(
    (fromAccountId: string, toAccountId: string, amountPaise: number) => {
      let snapshotFrom: number | undefined;
      let snapshotTo: number | undefined;

      setAccounts((prev) => {
        return prev.map((acc) => {
          if (acc.id === fromAccountId) {
            snapshotFrom = acc.balance;
            return { ...acc, balance: acc.balance - amountPaise };
          }
          if (acc.id === toAccountId) {
            snapshotTo = acc.balance;
            return { ...acc, balance: acc.balance + amountPaise };
          }
          return acc;
        });
      });

      return () => {
        setAccounts((prev) => {
          return prev.map((acc) => {
            if (acc.id === fromAccountId && snapshotFrom !== undefined) {
              return { ...acc, balance: snapshotFrom };
            }
            if (acc.id === toAccountId && snapshotTo !== undefined) {
              return { ...acc, balance: snapshotTo };
            }
            return acc;
          });
        });
      };
    },
    []
  );

  const reconcileBalances = useCallback(
    (
      fromAccountId: string,
      toAccountId: string,
      fromBalanceAfter: number,
      toBalanceAfter: number
    ) => {
      setAccounts((prev) => {
        return prev.map((acc) => {
          if (acc.id === fromAccountId) {
            return { ...acc, balance: fromBalanceAfter };
          }
          if (acc.id === toAccountId) {
            return { ...acc, balance: toBalanceAfter };
          }
          return acc;
        });
      });
    },
    []
  );

  return {
    accounts,
    isLoading,
    error,
    applyOptimisticTransfer,
    reconcileBalances,
    refetch: fetchAccounts,
  };
}
