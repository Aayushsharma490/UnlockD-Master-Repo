/**
 * db.js — Verdant Finance: SQLite database initialization
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'verdant.db');

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    preferences   TEXT DEFAULT '{"compact":false}'
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
    description     TEXT,
    merchant        TEXT,
    source          TEXT DEFAULT 'app',
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

  -- Bill Splitting Tables
  CREATE TABLE IF NOT EXISTS groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id       TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    paid_by     TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,       -- stored in paise
    description TEXT,
    split_type  TEXT NOT NULL CHECK(split_type IN ('equal', 'custom')),
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id          TEXT PRIMARY KEY,
    expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    amount_owed INTEGER NOT NULL       -- stored in paise
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_member TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    to_member   TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,       -- stored in paise
    status      TEXT NOT NULL CHECK(status IN ('pending', 'paid')) DEFAULT 'pending',
    paid_at     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_from_date ON transactions(from_account, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_to_date ON transactions(to_account, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant);
  CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
`);

// ─── Seed Demo Users & Accounts ─────────────────────────────────────────────

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

if (userCount.count === 0) {
  console.log('🌱 Database is empty. Seeding 5 demo users with accounts, budgets, and transactions...');

  // Pre-hashed 'password123' using bcryptjs
  const HASHED_PASSWORD = '$2b$10$V/NmfdvhCOqPvlATc/d2XOPlGFnJ4mWY7YhRfMUO9UM9hn/GFheiG';

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, name, balance, user_id)
    VALUES (?, ?, ?, ?)
  `);

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const runSeeding = db.transaction(() => {
    for (const u of demoUsers) {
      insertUser.run(u.id, u.name, u.email, HASHED_PASSWORD, now.toISOString());

      const checkId = `acc_chk_${u.id.replace('usr_', '')}`;
      const saveId = `acc_svg_${u.id.replace('usr_', '')}`;

      const checkingBalance = 20000000; // ₹2,00,000 in paise
      const savingsBalance = 100000000; // ₹10,00,000 in paise

      insertAccount.run(checkId, 'Checking', checkingBalance, u.id);
      insertAccount.run(saveId, 'Savings', savingsBalance, u.id);

      const foodBudgetId = `bud_food_${u.id.replace('usr_', '')}`;
      const entBudgetId = `bud_ent_${u.id.replace('usr_', '')}`;

      insertBudget.run(foodBudgetId, u.id, 'Food', currentMonthStr, 1500000, now.toISOString());
      insertBudget.run(entBudgetId, u.id, 'Entertainment', currentMonthStr, 800000, now.toISOString());
    }

    // Seed external merchant account for outgoing imported/direct transactions
    db.prepare(`
      INSERT INTO accounts (id, name, balance, user_id)
      VALUES ('acc_ext_imported', 'External Merchant', 0, 'usr_priya')
    `).run();

    const seedTransactions = [
      {
        id: 'seed_tx_1',
        from: 'acc_chk_arjun',
        to: 'acc_svg_arjun',
        amount: 500000,
        status: 'success',
        category: 'Shopping',
        note: 'SIP savings sweep',
        description: 'SIP Auto Investment',
        merchant: 'Groww Mutual Funds',
        daysAgo: 14,
      },
      {
        id: 'seed_tx_2',
        from: 'acc_chk_priya',
        to: 'acc_chk_arjun',
        amount: 120000,
        status: 'success',
        category: 'Food',
        note: 'Split dinner bill',
        description: 'Dinner Splitting',
        merchant: 'Social Restaurant',
        daysAgo: 13,
      },
      {
        id: 'seed_tx_3',
        from: 'acc_chk_arjun',
        to: 'acc_chk_rohit',
        amount: 350000,
        status: 'success',
        category: 'Food',
        note: 'Office lunch pool',
        description: 'Lunch with colleagues',
        merchant: 'Kitchens of India',
        daysAgo: 12,
      },
      {
        id: 'seed_tx_4',
        from: 'acc_svg_kabir',
        to: 'acc_chk_kabir',
        amount: 1500000,
        status: 'success',
        category: 'Bills',
        note: 'Quarterly yield payout',
        description: 'Quarterly Dividends',
        merchant: 'HDFC Securities',
        daysAgo: 11,
      },
      {
        id: 'seed_tx_5',
        from: 'acc_chk_ananya',
        to: 'acc_chk_priya',
        amount: 250000,
        status: 'success',
        category: 'Entertainment',
        note: 'Gifts share',
        description: 'Birthday Celebrations',
        merchant: 'BookMyShow',
        daysAgo: 10,
      },
      {
        id: 'seed_tx_6',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 89900,
        status: 'success',
        category: 'Shopping',
        note: 'Bought wireless earbuds',
        description: 'Electronics Purchase',
        merchant: 'Amazon India',
        daysAgo: 9,
      },
      {
        id: 'seed_tx_7',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 45000,
        status: 'success',
        category: 'Transport',
        note: 'Weekly ride back home',
        description: 'Cab Ride',
        merchant: 'Uber Rides',
        daysAgo: 8,
      },
      {
        id: 'seed_tx_8',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 125000,
        status: 'success',
        category: 'Bills',
        note: 'Electricity payment',
        description: 'Electricity Bill',
        merchant: 'BSES Rajdhani',
        daysAgo: 7,
      },
      {
        id: 'seed_tx_9',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 64900,
        status: 'success',
        category: 'Entertainment',
        note: 'Monthly video streaming',
        description: 'Netflix Monthly Premium',
        merchant: 'Netflix India',
        daysAgo: 6,
      },
      {
        id: 'seed_tx_10',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 32000,
        status: 'success',
        category: 'Food',
        note: 'Pizza party',
        description: 'Office Snacks Order',
        merchant: 'Dominoes Pizza',
        daysAgo: 5,
      },
      {
        id: 'seed_tx_11',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 150000,
        status: 'success',
        category: 'Shopping',
        note: 'Casual sneakers',
        description: 'Sneaker Shopping',
        merchant: 'Myntra Retail',
        daysAgo: 4,
      },
      {
        id: 'seed_tx_12',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 11900,
        status: 'success',
        category: 'Entertainment',
        note: 'Music streaming subscription',
        description: 'Spotify Premium Family',
        merchant: 'Spotify Premium',
        daysAgo: 3,
      },
      {
        id: 'seed_tx_13',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 120000,
        status: 'success',
        category: 'Other',
        note: 'Hardware tools',
        description: 'Home Improvement Tools',
        merchant: 'Ace Hardware',
        daysAgo: 2,
      },
      {
        id: 'seed_tx_14',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 45000,
        status: 'success',
        category: 'Food',
        note: 'Burgers dinner',
        description: 'Gourmet Burger Dining',
        merchant: 'Burger Singh',
        daysAgo: 1,
      },
      {
        id: 'seed_tx_15',
        from: 'acc_chk_arjun',
        to: 'acc_ext_imported',
        amount: 22000,
        status: 'success',
        category: 'Transport',
        note: 'Airport shuttle',
        description: 'Airport Ride',
        merchant: 'MakeMyTrip Cabs',
        daysAgo: 0,
      }
    ];

    for (const tx of seedTransactions) {
      const ikey = `seed_ikey_${tx.id}`;
      const timeStr = new Date(nowMs - tx.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      insertTransaction.run(tx.id, ikey, tx.from, tx.to, tx.amount, tx.status, tx.category, tx.note, tx.description || null, tx.merchant || null, timeStr);
    }

    // Seed a sample Group for Arjun to demonstrate Bill Splitting
    const groupId = 'gp_trip2026';
    db.prepare(`
      INSERT INTO groups (id, name, created_by, created_at)
      VALUES (?, 'Goa Cultivation Trip', 'usr_arjun', ?)
    `).run(groupId, now.toISOString());

    const members = [
      { id: 'gpm_arjun', name: 'Arjun Mehta' },
      { id: 'gpm_priya', name: 'Priya Sharma' },
      { id: 'gpm_rohit', name: 'Rohit Kapoor' },
    ];

    const insertMem = db.prepare('INSERT INTO group_members (id, group_id, name) VALUES (?, ?, ?)');
    for (const m of members) {
      insertMem.run(m.id, groupId, m.name);
    }

    // Seed a sample expense: Arjun paid ₹6,000 for Villa Rental split equally
    const expId = 'exp_villa';
    db.prepare(`
      INSERT INTO expenses (id, group_id, paid_by, amount, description, split_type, created_at)
      VALUES (?, ?, 'gpm_arjun', 600000, 'Villa Booking', 'equal', ?)
    `).run(expId, groupId, now.toISOString());

    const insertSplit = db.prepare('INSERT INTO expense_splits (id, expense_id, member_id, amount_owed) VALUES (?, ?, ?, ?)');
    insertSplit.run('spl_1', expId, 'gpm_arjun', 200000);
    insertSplit.run('spl_2', expId, 'gpm_priya', 200000);
    insertSplit.run('spl_3', expId, 'gpm_rohit', 200000);

    // Run optimization
    const insertSettlement = db.prepare(`
      INSERT INTO settlements (id, group_id, from_member, to_member, amount, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    // Greedy algorithm results for: Arjun paid 6000, owed 2000. Priya owed 2000, Rohit owed 2000.
    // Priya owes Arjun 2000, Rohit owes Arjun 2000.
    insertSettlement.run('set_seed_1', groupId, 'gpm_priya', 'gpm_arjun', 200000);
    insertSettlement.run('set_seed_2', groupId, 'gpm_rohit', 'gpm_arjun', 200000);
  });

  runSeeding();

  console.log('✅ Demo users, portfolios, budgets, transactions, and group seeds successfully added.');
}

export default db;
