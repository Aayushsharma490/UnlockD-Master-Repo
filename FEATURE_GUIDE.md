# Verdant — Feature Build Guide

*Quick-reference for live judge explanations. Updated after every sprint.*
*If you're reading this in Round 3: every answer here comes from the actual code — trace it.*

---

## Round 1 — Feature 1: Transactions

### What it does
Secure money transfer between two accounts with:
- Real-time balance animation (GSAP count-up)
- Optimistic UI — balance updates before server confirms
- Full transaction history (timestamp, parties, amount, status)
- Protection against duplicate submissions (idempotency key)
- Protection against overdrafts (balance check inside SQLite transaction)

---

### How it was built

**Backend:** `backend/src/` — Node.js + Express + SQLite via `better-sqlite3`.

Two tables:
- `accounts` — id, name, balance (in **paise**, not rupees — integer, never float)
- `transactions` — id, idempotency_key (UNIQUE), from/to account, amount, status, note, created_at

The transfer endpoint (`POST /api/transactions`) is the core of the backend.
It does five things, all inside one `db.transaction()` call:
1. Read sender's current balance
2. Check `sender.balance >= amount` — INSIDE the transaction, not before
3. Debit sender: `UPDATE accounts SET balance = balance - ?`
4. Credit receiver: `UPDATE accounts SET balance = balance + ?`
5. Insert a transaction record with `status = 'success'`

If anything throws (including the balance check), `better-sqlite3` automatically issues `ROLLBACK` — no partial state ever reaches the database.

**Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + Framer Motion + GSAP + Lenis.

The transfer flow:
1. `TransferForm` mounts → generates a UUID idempotency key (once per session)
2. User submits → form locks (`isLocked = true`, button disabled)
3. `applyOptimisticTransfer()` from `useAccounts` instantly updates both balances in local state and returns a `rollback()` closure
4. A 'pending' transaction row is prepended to history via `addPendingTransaction()`
5. `fetch('/api/transactions', { method: 'POST', body: ... })` fires
6. **Success:** `reconcileBalances()` overwrites optimistic values with server-confirmed numbers. Transaction row status updates to 'success'.
7. **Failure:** `rollback()` is called — balances silently revert. Transaction row status updates to 'failed'.

---

### Files that matter

| File | What it does |
|---|---|
| `backend/src/db.js` | Schema creation, WAL mode config, demo data seed |
| `backend/src/routes/transactions.js` | The atomic transfer endpoint — read this one carefully |
| `backend/src/routes/accounts.js` | Simple GET for form dropdowns |
| `frontend/src/hooks/useAccounts.ts` | Optimistic update + rollback logic |
| `frontend/src/hooks/useTransactions.ts` | Pending transaction insertion + status reconciliation |
| `frontend/src/hooks/useLenis.ts` | Lenis + GSAP ScrollTrigger integration |
| `frontend/src/components/transfer/TransferForm.tsx` | The full transfer flow — form → submit → optimistic → reconcile |
| `frontend/src/components/accounts/BalanceCounter.tsx` | GSAP tween for the animated balance counter |
| `frontend/src/components/transactions/TransactionHistory.tsx` | History list with skeleton + scroll-triggered reveal |
| `frontend/src/utils/idempotency.ts` | UUID v4 key generation with explanation |
| `frontend/src/utils/currency.ts` | Paise ↔ rupee conversions (Intl.NumberFormat) |

---

### Likely judge questions + answers

**Q: What happens if two transfer requests hit at the same time from the same account with insufficient combined balance?**

A: The balance check is inside the same SQLite `db.transaction()` as the debit. SQLite serializes writes using a write lock — the second request can only start its transaction after the first has committed. So the second request reads the *already-debited* balance and correctly gets rejected. This is why the check must be inside the transaction, not before it.

---

**Q: How do you prevent someone double-clicking submit and creating two transfers?**

A: Two layers:
1. **UI layer:** The form sets `isLocked = true` and disables the submit button on first click. Subsequent clicks are ignored.
2. **Server layer:** Each form session generates one UUID `idempotency_key` (in `utils/idempotency.ts`). If the same key is seen twice (network retry, race condition), the server returns the original result from the database instead of running the transfer again. The `idempotency_key` column has a `UNIQUE` constraint.

---

**Q: Why does the optimistic update work — and how does it roll back?**

A: `useAccounts.applyOptimisticTransfer()` snapshots the current balances of both accounts, then immediately updates local React state with the new values (sender down, receiver up). It returns a closure that, when called, restores the snapshot values. `TransferForm` stores this closure as `rollback` and calls it if the server returns an error or if a network error occurs.

---

**Q: Why SQLite instead of Postgres?**

A: Zero external setup — no separate container, no env vars, no secrets for judges to configure. SQLite supports full ACID transactions (exactly what atomic transfer needs) and is trivially containerized. The database file persists in a named Docker volume (`verdant_db`) so data survives `docker-compose restart`.

---

**Q: Why store balance as an integer (paise) instead of a decimal?**

A: IEEE 754 floats can't represent all decimal values exactly — `0.1 + 0.2 = 0.30000000000000004` in JavaScript. For money, a 1-paise rounding error compounds across transactions and creates trust issues. By storing the smallest currency unit as an integer and only dividing by 100 at display time (in `utils/currency.ts`), all arithmetic stays exact.

---

**Q: Walk me through what happens end-to-end when I click "Transfer."**

A:
1. `TransferForm.handleSubmit()` runs — client-side validation passes
2. `setSubmitState('submitting')` — form locks, button shows spinner
3. `onOptimisticTransfer(fromId, toId, amountPaise)` — `useAccounts` immediately updates React state, returns `rollback` closure
4. `onTransactionAdded(pendingTx)` — history list gets a new 'pending' row at the top
5. `fetch('/api/transactions', { method: 'POST', body: JSON.stringify({ ..., idempotency_key }) })`
6. **Server receives request:**
   - Checks `idempotency_key` — if seen before, returns original result (dedup path)
   - Opens SQLite transaction: reads sender balance → checks sufficiency → debits sender → credits receiver → inserts transaction record → commits
   - Returns `{ transaction: { ..., from_balance_after, to_balance_after } }`
7. **Response handling:**
   - Success (201): `reconcileBalances(fromId, toId, fromBalanceAfter, toBalanceAfter)` → overwrites optimistic values with authoritative server numbers. Transaction row updates to 'success'. `SuccessConfirmation` renders with path-draw checkmark animation.
   - Failure (400): `rollback()` → balances silently revert to pre-transfer values. Transaction row updates to 'failed'. `SuccessConfirmation` renders failure state.

---

**Q: What's the difference between the optimistic balance and the reconciled balance?**

A: The optimistic balance is a client-side guess: `currentBalance - amount`. The reconciled balance comes from the server's response: `from_balance_after`. They *should* be identical, but using the server's value ensures we're always in sync with the ground truth in the database — important if there are concurrent updates or floating-point edge cases.

---

## Round 1 — Feature 2: Smart Budgeting

### What it does
Live-computed budget tracking with zero manual/cron monthly reset jobs:
- Set and update limits inline per category (`Food`, `Transport`, `Shopping`, `Bills`, `Entertainment`, `Other`).
- Dynamic progress indicators that change colors depending on utilization (green < 80%, orange/sandy warning >= 80%, terracotta >= 100%).
- Dashboard integration showing top 3 categories closest to limit.
- Real-time floating toast/banner notification when a transaction crosses 80% or 100% of a category budget.
- Automatic full synchronization on modal closure (re-fetching accounts, transactions, and budgets).

---

### How it was built

**Backend:**
- Added a `budgets` table with a `UNIQUE(user_id, category, month)` constraint in `backend/src/db.js`.
- Added a `category` column to `transactions` table.
- Utilization is computed live in SQLite aggregates inside `backend/src/routes/budgets.js` by joining user accounts and summing successful transactions for the current month. This naturally resets every month with zero extra logic since the query automatically groups transactions by the current `strftime('%Y-%m')` month.
- The transfer creation route (`POST /api/transactions`) checks if the user has a budget limit for the transaction's category. If so, it returns a `budgetAlert` object containing the updated spent, limit, and percentUsed statistics.

**Frontend:**
- Created the `/budgets` page showing category envelopes. Clicking the pencil icon enters edit mode, allowing the user to update the limit inline.
- The Transfer Form now requires selecting an expense category.
- If a transaction response contains a `budgetAlert` crossing 80% or 100%, the root `App.tsx` renders a floating, auto-dismissing toast warning.
- Clicking the Done/Dismiss button in the SuccessConfirmation modal calls `refetchAccounts()` and `refetchTransactions()` to synchronise the client state instantly.
- The Dashboard layout displays accounts list and budget summaries side-by-side (3:2 ratio grid), showing the categories closest to their limit.

---

### Files that matter

| File | What it does |
|---|---|
| `backend/src/routes/budgets.js` | Live computed budget aggregations and limit upserts |
| `frontend/src/components/budgets/BudgetsPage.tsx` | Envelope budget settings list with inline limits edit |
| `frontend/src/components/dashboard/DashboardPage.tsx` | Dashboard view with Side-by-side accounts and budgets summary grid |
| `frontend/src/components/transfer/TransferForm.tsx` | Added required category select and budget toast triggers |
| `frontend/src/App.tsx` | Added budgets router, global toast state, and done-refresh listeners |

---

### Likely judge questions + answers

**Q: Why compute budget spent live instead of keeping a running total column in the budgets table?**

A: Keeping a running total requires extra write steps, increases locking contention, and introduces data drift risks (e.g. if a transaction changes status or gets deleted). Live computation ensures the budget is always perfectly in sync with the transaction ledger. It also automatically "resets" at the turn of a new month because the aggregate query naturally filters transactions by the current `YYYY-MM` timestamp, eliminating the need for complex, bug-prone monthly cron jobs.

**Q: How does the application avoid page flashes during balance updates?**

A: It combines Optimistic UI with automatic background refetches on dismissal. As soon as the user hits "Transfer", the client instantly deducts the balance locally. When the user closes the modal by clicking "Done", the client silently runs background refetches to align the local state with the backend's authoritative database values.

---

## Round 1 — Feature 3: [add once revealed]

**What it does:**

**How it was built:**

**Files that matter:**

**Likely judge questions + answers:**

