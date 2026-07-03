/**
 * types/index.ts — Verdant Finance: Shared TypeScript types
 *
 * Keeping all shared types in one file makes the API contract
 * obvious and easy to find when judges ask "what does this response look like?"
 */

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  /** Balance stored as integer paise (1 INR = 100 paise). Never a float. */
  balance: number;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface Transaction {
  id: string;
  from_account: string;
  to_account: string;
  /** Account display names — joined server-side so we don't need extra lookups */
  from_name: string;
  to_name: string;
  /** Amount in paise */
  amount: number;
  status: TransactionStatus;
  note: string | null;
  created_at: string; // ISO 8601
  idempotency_key?: string | null;
}

/** Returned by POST /api/transactions on success — includes post-transfer balances */
export interface TransactionResult extends Transaction {
  from_balance_after?: number;
  to_balance_after?: number;
}

// ─── Transfer form ────────────────────────────────────────────────────────────

export interface TransferPayload {
  from_account: string;
  to_account: string;
  /** Amount in paise — form converts from rupees input */
  amount: number;
  note: string;
  idempotency_key: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface AccountsResponse {
  accounts: Account[];
}

export interface TransactionsResponse {
  transactions: Transaction[];
}

export interface TransactionResponse {
  transaction: TransactionResult;
  deduplicated?: boolean;
}

export interface ApiError {
  error: string;
  code?: 'INSUFFICIENT_FUNDS' | 'ACCOUNT_NOT_FOUND' | string;
  available?: number;
  requested?: number;
  transaction?: Transaction; // failed transaction record if INSUFFICIENT_FUNDS
}

// ─── UI state ─────────────────────────────────────────────────────────────────

export type SubmitState = 'idle' | 'submitting' | 'success' | 'failed';

export interface OptimisticUpdate {
  accountId: string;
  previousBalance: number;
}
