/**
 * db.js — Verdant Finance: SQLite database initialization
 *
 * Scopes accounts, transactions, and budgets to users. Seeds 5 realistic demo users
 * with preset accounts, transaction histories, and budgets on first boot.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Store the DB file in data/ so Docker volume mounts persist it
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'verdant.db');

// Ensure the data directory exists before opening the database
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Enforce foreign key constraints
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    preferences   TEXT DEFAULT '{"compact":false}' -- stores UI density, etc.
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0, -- stored in paise
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    from_account    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount          INTEGER NOT NULL,
    status          TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed')),
    category        TEXT DEFAULT 'Uncategorized',
    note            TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,
    month        TEXT NOT NULL,          -- 'YYYY-MM'
    limit_amount INTEGER NOT NULL,      -- in paise
    created_at   TEXT NOT NULL,
    UNIQUE(user_id, category, month)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_transactions_idempotency
    ON transactions(idempotency_key);
    
  CREATE INDEX IF NOT EXISTS idx_accounts_user
    ON accounts(user_id);

  CREATE INDEX IF NOT EXISTS idx_budgets_user_month
    ON budgets(user_id, month);
`);

// ─── Seed Demo Users & Accounts ─────────────────────────────────────────────

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

if (userCount.count === 0) {
  console.log('🌱 Database is empty. Seeding 5 demo users with accounts, budgets, and transactions...');

  // Pre-hashed 'password123' using bcrypt (10 rounds)
  const HASHED_PASSWORD = '$2b$10$3EOebDLIX18WCsCPmLm1wuUBd3UcAGKy00RDaMcnzPS2EmD22tME.';

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, name, balance, user_id)
    VALUES (?, ?, ?, ?)
  `);

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBudget = db.prepare(`
    INSERT INTO budgets (id, user_id, category, month, limit_amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const nowMs = now.getTime();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const demoUsers = [
    { id: 'usr_arjun', name: 'Arjun Mehta', email: 'arjun@verdant.com' },
    { id: 'usr_priya', name: 'Priya Sharma', email: 'priya@verdant.com' },
    { id: 'usr_rohit', name: 'Rohit Kapoor', email: 'rohit@verdant.com' },
    { id: 'usr_ananya', name: 'Ananya Iyer', email: 'ananya@verdant.com' },
    { id: 'usr_kabir', name: 'Kabir Sen', email: 'kabir@verdant.com' },
  ];

  db.transaction(() => {
    // Seed users
    for (const u of demoUsers) {
      insertUser.run(u.id, u.name, u.email, HASHED_PASSWORD, now.toISOString());

      // Create standard Checking and Savings accounts for each user
      const checkId = `acc_chk_${u.id.replace('usr_', '')}`;
      const saveId = `acc_svg_${u.id.replace('usr_', '')}`;

      const checkingBalance = u.id === 'usr_arjun' ? 4250000 : u.id === 'usr_priya' ? 7820000 : 3100000;
      const savingsBalance = u.id === 'usr_arjun' ? 11500000 : u.id === 'usr_priya' ? 24500000 : 8900000;

      insertAccount.run(checkId, 'Checking', checkingBalance, u.id);
      insertAccount.run(saveId, 'Savings', savingsBalance, u.id);

      // Seed 2 budgets per user (Food and Entertainment) for the current month
      const foodBudgetId = `bud_food_${u.id.replace('usr_', '')}`;
      const entBudgetId = `bud_ent_${u.id.replace('usr_', '')}`;

      insertBudget.run(foodBudgetId, u.id, 'Food', currentMonthStr, 1500000, now.toISOString()); // ₹15,000 limit
      insertBudget.run(entBudgetId, u.id, 'Entertainment', currentMonthStr, 800000, now.toISOString()); // ₹8,000 limit
    }

    // Seed transaction ledger entries between seeded accounts
    const seedTransactions = [
      {
        id: 'seed_tx_1',
        from: 'acc_chk_arjun',
        to: 'acc_svg_arjun',
        amount: 500000,
        status: 'success',
        category: 'Shopping',
        note: 'SIP savings sweep',
        daysAgo: 10,
      },
      {
        id: 'seed_tx_2',
        from: 'acc_chk_priya',
        to: 'acc_chk_arjun',
        amount: 120000,
        status: 'success',
        category: 'Food',
        note: 'Split dinner bill',
        daysAgo: 7,
      },
      {
        id: 'seed_tx_3',
        from: 'acc_chk_arjun',
        to: 'acc_chk_rohit',
        amount: 350000,
        status: 'success',
        category: 'Food',
        note: 'Office lunch pool',
        daysAgo: 4,
      },
      {
        id: 'seed_tx_4',
        from: 'acc_svg_kabir',
        to: 'acc_chk_kabir',
        amount: 1500000,
        status: 'success',
        category: 'Bills',
        note: 'Quarterly yield payout',
        daysAgo: 3,
      },
      {
        id: 'seed_tx_5',
        from: 'acc_chk_ananya',
        to: 'acc_chk_priya',
        amount: 250000,
        status: 'success',
        category: 'Entertainment',
        note: 'Gifts share',
        daysAgo: 1,
      },
    ];

    for (const tx of seedTransactions) {
      const ikey = `seed_ikey_${tx.id}`;
      const timeStr = new Date(nowMs - tx.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      insertTransaction.run(tx.id, ikey, tx.from, tx.to, tx.amount, tx.status, tx.category, tx.note, timeStr);
    }
  })();

  console.log('✅ Demo users, portfolios, budgets, and transactions seeded.');
}

export default db;
