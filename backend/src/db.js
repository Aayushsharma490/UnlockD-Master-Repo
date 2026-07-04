/**
 * db.js — Verdant Finance: PostgreSQL database initialization and pool manager
 */

import pg from 'pg';

const { Pool } = pg;

// Enforce JWT_SECRET and DATABASE_URL
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is missing.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        preferences   JSONB DEFAULT '{"compact":false}'::jsonb
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        balance     BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deleted_at  TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id              TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        from_account    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_account      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        amount          BIGINT NOT NULL,
        status          TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed')),
        category        TEXT DEFAULT 'Uncategorized',
        note            TEXT,
        description     TEXT,
        merchant        TEXT,
        source          TEXT DEFAULT 'app',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category     TEXT NOT NULL,
        month        TEXT NOT NULL,          -- 'YYYY-MM'
        limit_amount BIGINT NOT NULL,      -- in paise
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at   TIMESTAMPTZ,
        UNIQUE(user_id, category, month)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id       TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        name     TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id          TEXT PRIMARY KEY,
        group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        paid_by     TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
        amount      BIGINT NOT NULL,       -- stored in paise
        description TEXT,
        split_type  TEXT NOT NULL CHECK(split_type IN ('equal', 'custom')),
        category    TEXT DEFAULT 'Other',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_splits (
        id          TEXT PRIMARY KEY,
        expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        member_id   TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
        amount_owed BIGINT NOT NULL       -- stored in paise
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settlements (
        id          TEXT PRIMARY KEY,
        group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        from_member TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
        to_member   TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
        amount      BIGINT NOT NULL,       -- stored in paise
        status      TEXT NOT NULL CHECK(status IN ('pending', 'paid')) DEFAULT 'pending',
        paid_at     TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used        INTEGER NOT NULL DEFAULT 0
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_transfers (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_account  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_account    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        amount        BIGINT NOT NULL,
        frequency     TEXT NOT NULL CHECK(frequency IN ('once', 'weekly', 'monthly')),
        next_run_date TIMESTAMPTZ NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'cancelled', 'completed')),
        last_run_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_from_date ON transactions(from_account, created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_to_date ON transactions(to_account, created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id) WHERE deleted_at IS NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month) WHERE deleted_at IS NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);`);

    await client.query('COMMIT');

    // Seeding if database is empty
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(rows[0].count, 10);
    if (userCount === 0) {
      console.log('🌱 Database is empty. Seeding 5 demo users with accounts, budgets, and transactions...');
      const HASHED_PASSWORD = '$2b$10$V/NmfdvhCOqPvlATc/d2XOPlGFnJ4mWY7YhRfMUO9UM9hn/GFheiG'; // password123

      await pool.query('BEGIN');

      const demoUsers = [
        { id: 'usr_arjun', name: 'Arjun Mehta', email: 'arjun@verdant.com' },
        { id: 'usr_priya', name: 'Priya Sharma', email: 'priya@verdant.com' },
        { id: 'usr_rohit', name: 'Rohit Kapoor', email: 'rohit@verdant.com' },
        { id: 'usr_ananya', name: 'Ananya Iyer', email: 'ananya@verdant.com' },
        { id: 'usr_kabir', name: 'Kabir Sen', email: 'kabir@verdant.com' },
      ];

      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      for (const u of demoUsers) {
        await pool.query(
          `INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [u.id, u.name, u.email, HASHED_PASSWORD, now]
        );

        const checkId = `acc_chk_${u.id.replace('usr_', '')}`;
        const saveId = `acc_svg_${u.id.replace('usr_', '')}`;

        const checkingBalance = 20000000; // ₹2,00,000 in paise
        const savingsBalance = 100000000; // ₹10,00,000 in paise

        await pool.query(`INSERT INTO accounts (id, name, balance, user_id) VALUES ($1, $2, $3, $4)`, [checkId, 'Checking', checkingBalance, u.id]);
        await pool.query(`INSERT INTO accounts (id, name, balance, user_id) VALUES ($1, $2, $3, $4)`, [saveId, 'Savings', savingsBalance, u.id]);

        const foodBudgetId = `bud_food_${u.id.replace('usr_', '')}`;
        const entBudgetId = `bud_ent_${u.id.replace('usr_', '')}`;

        await pool.query(`INSERT INTO budgets (id, user_id, category, month, limit_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [foodBudgetId, u.id, 'Food', currentMonthStr, 1500000, now]);
        await pool.query(`INSERT INTO budgets (id, user_id, category, month, limit_amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [entBudgetId, u.id, 'Entertainment', currentMonthStr, 800000, now]);
      }

      await pool.query(
        `INSERT INTO accounts (id, name, balance, user_id) VALUES ($1, $2, $3, $4)`,
        ['acc_ext_imported', 'External Merchant', 0, 'usr_priya']
      );

      const seedTransactions = [
        { id: 'seed_tx_1', from: 'acc_chk_arjun', to: 'acc_svg_arjun', amount: 500000, status: 'success', category: 'Shopping', note: 'SIP savings sweep', description: 'SIP Auto Investment', merchant: 'Groww Mutual Funds', daysAgo: 14 },
        { id: 'seed_tx_2', from: 'acc_chk_priya', to: 'acc_chk_arjun', amount: 120000, status: 'success', category: 'Food', note: 'Split dinner bill', description: 'Dinner Splitting', merchant: 'Social Restaurant', daysAgo: 13 },
        { id: 'seed_tx_3', from: 'acc_chk_arjun', to: 'acc_chk_rohit', amount: 350000, status: 'success', category: 'Food', note: 'Office lunch pool', description: 'Lunch with colleagues', merchant: 'Kitchens of India', daysAgo: 12 },
        { id: 'seed_tx_4', from: 'acc_svg_kabir', to: 'acc_chk_kabir', amount: 1500000, status: 'success', category: 'Bills', note: 'Quarterly yield payout', description: 'Quarterly Dividends', merchant: 'HDFC Securities', daysAgo: 11 },
        { id: 'seed_tx_5', from: 'acc_chk_ananya', to: 'acc_chk_priya', amount: 250000, status: 'success', category: 'Entertainment', note: 'Gifts share', description: 'Birthday Celebrations', merchant: 'BookMyShow', daysAgo: 10 },
        { id: 'seed_tx_6', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 89900, status: 'success', category: 'Shopping', note: 'Bought wireless earbuds', description: 'Electronics Purchase', merchant: 'Amazon India', daysAgo: 9 },
        { id: 'seed_tx_7', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 45000, status: 'success', category: 'Transport', note: 'Weekly ride back home', description: 'Cab Ride', merchant: 'Uber Rides', daysAgo: 8 },
        { id: 'seed_tx_8', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 125000, status: 'success', category: 'Bills', note: 'Electricity payment', description: 'Electricity Bill', merchant: 'BSES Rajdhani', daysAgo: 7 },
        { id: 'seed_tx_9', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 64900, status: 'success', category: 'Entertainment', note: 'Monthly video streaming', description: 'Netflix Monthly Premium', merchant: 'Netflix India', daysAgo: 6 },
        { id: 'seed_tx_10', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 32000, status: 'success', category: 'Food', note: 'Pizza party', description: 'Office Snacks Order', merchant: 'Dominoes Pizza', daysAgo: 5 },
        { id: 'seed_tx_11', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 150000, status: 'success', category: 'Shopping', note: 'Casual sneakers', description: 'Sneaker Shopping', merchant: 'Myntra Retail', daysAgo: 4 },
        { id: 'seed_tx_12', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 11900, status: 'success', category: 'Entertainment', note: 'Music streaming subscription', description: 'Spotify Premium Family', merchant: 'Spotify Premium', daysAgo: 3 },
        { id: 'seed_tx_13', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 120000, status: 'success', category: 'Other', note: 'Hardware tools', description: 'Home Improvement Tools', merchant: 'Ace Hardware', daysAgo: 2 },
        { id: 'seed_tx_14', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 45000, status: 'success', category: 'Food', note: 'Burgers dinner', description: 'Gourmet Burger Dining', merchant: 'Burger Singh', daysAgo: 1 },
        { id: 'seed_tx_15', from: 'acc_chk_arjun', to: 'acc_ext_imported', amount: 22000, status: 'success', category: 'Transport', note: 'Airport shuttle', description: 'Airport Ride', merchant: 'MakeMyTrip Cabs', daysAgo: 0 }
      ];

      for (const tx of seedTransactions) {
        const ikey = `seed_ikey_${tx.id}`;
        const timeVal = new Date(now.getTime() - tx.daysAgo * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [tx.id, ikey, tx.from, tx.to, tx.amount, tx.status, tx.category, tx.note, tx.description, tx.merchant, timeVal]
        );
      }

      // Seed Group
      const groupId = 'gp_trip2026';
      await pool.query(`INSERT INTO groups (id, name, created_by, created_at) VALUES ($1, $2, $3, $4)`, [groupId, 'Goa Cultivation Trip', 'usr_arjun', now]);

      const members = [
        { id: 'gpm_arjun', name: 'Arjun Mehta' },
        { id: 'gpm_priya', name: 'Priya Sharma' },
        { id: 'gpm_rohit', name: 'Rohit Kapoor' },
      ];

      for (const m of members) {
        await pool.query('INSERT INTO group_members (id, group_id, name) VALUES ($1, $2, $3)', [m.id, groupId, m.name]);
      }

      const expId = 'exp_villa';
      await pool.query(
        `INSERT INTO expenses (id, group_id, paid_by, amount, description, split_type, category, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [expId, groupId, 'gpm_arjun', 600000, 'Villa Booking', 'equal', 'Other', now]
      );

      await pool.query('INSERT INTO expense_splits (id, expense_id, member_id, amount_owed) VALUES ($1, $2, $3, $4)', ['spl_1', expId, 'gpm_arjun', 200000]);
      await pool.query('INSERT INTO expense_splits (id, expense_id, member_id, amount_owed) VALUES ($1, $2, $3, $4)', ['spl_2', expId, 'gpm_priya', 200000]);
      await pool.query('INSERT INTO expense_splits (id, expense_id, member_id, amount_owed) VALUES ($1, $2, $3, $4)', ['spl_3', expId, 'gpm_rohit', 200000]);

      await pool.query('INSERT INTO settlements (id, group_id, from_member, to_member, amount, status) VALUES ($1, $2, $3, $4, $5, $6)', ['set_seed_1', groupId, 'gpm_priya', 'gpm_arjun', 200000, 'pending']);
      await pool.query('INSERT INTO settlements (id, group_id, from_member, to_member, amount, status) VALUES ($1, $2, $3, $4, $5, $6)', ['set_seed_2', groupId, 'gpm_rohit', 'gpm_arjun', 200000, 'pending']);

      await pool.query('COMMIT');
      console.log('✅ Seeding completed successfully.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', err);
    throw err;
  } finally {
    client.release();
  }
}

export default {
  query: (text, params) => pool.query(text, params),
  getPool: () => pool,
};
