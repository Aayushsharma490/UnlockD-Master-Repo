/**
 * index.js — Verdant Finance Express Entrypoint
 *
 * Boots the server, initializes SQLite tables, and registers
 * routing layers for auth, accounts, transactions, budgets, groups, and user profiles.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRouter from './routes/auth.js';
import accountsRouter from './routes/accounts.js';
import transactionsRouter from './routes/transactions.js';
import usersRouter from './routes/users.js';
import budgetsRouter from './routes/budgets.js';
import groupsRouter from './routes/groups.js';

// Import db to trigger database schema creation
import './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://frontend:5173',
    'http://localhost:4173',
  ],
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true, // required to pass JWT cookies
}));

app.use(express.json());
app.use(cookieParser()); // parses jwt cookie into req.cookies

// ── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/users', usersRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/groups', groupsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Verdant Finance API',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌿 Verdant Finance API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});
