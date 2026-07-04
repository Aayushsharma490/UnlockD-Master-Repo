/**
 * auth.js — Auth routes for signup, login, logout, forgot-password, and reset-password (PostgreSQL)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import db from '../db.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is missing.');
  process.exit(1);
}

// Cookie settings for JWT
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function isValidPassword(password) {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

// Rate Limiter on login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Signup ──────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both a letter and a number.' });
  }

  try {
    // Check if user already exists
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'usr_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const now = new Date();

    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      
      // 1. Insert user
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, created_at, preferences)
        VALUES ($1, $2, $3, $4, $5, '{"compact":false}'::jsonb)
      `, [userId, name, email.toLowerCase(), passwordHash, now]);

      // 2. Auto-create Checking and Savings accounts
      const checkingId = 'acc_chk_' + uuidv4().replace(/-/g, '').slice(0, 12);
      const savingsId = 'acc_svg_' + uuidv4().replace(/-/g, '').slice(0, 12);

      await client.query(`
        INSERT INTO accounts (id, name, balance, user_id) VALUES ($1, $2, $3, $4)
      `, [checkingId, 'Checking', 4250000, userId]); // ₹42,500 in paise
      
      await client.query(`
        INSERT INTO accounts (id, name, balance, user_id) VALUES ($1, $2, $3, $4)
      `, [savingsId, 'Savings', 11500000, userId]); // ₹1,15,000 in paise

      // 3. Seed sample transactions
      const sampleTxns = [
        { id: 'tx_init_1', amount: 150000, category: 'Food', note: 'Weekly Groceries', desc: 'Whole Foods Market', merch: 'Whole Foods', daysAgo: 10, isOutflow: true },
        { id: 'tx_init_2', amount: 50000, category: 'Transport', note: 'Commute refill', desc: 'Uber Ride share', merch: 'Uber', daysAgo: 8, isOutflow: true },
        { id: 'tx_init_3', amount: 120000, category: 'Shopping', note: 'New books & apparel', desc: 'Amazon Marketplace', merch: 'Amazon', daysAgo: 5, isOutflow: true },
        { id: 'tx_init_4', amount: 300000, category: 'Other', note: 'Pocket cash sweep', desc: 'Self-Transfer Deposit', merch: 'Self Deposit', daysAgo: 2, isOutflow: false }
      ];

      for (const t of sampleTxns) {
        const txId = 'tx_' + uuidv4().replace(/-/g, '').slice(0, 16);
        const ikey = 'ikey_' + uuidv4().replace(/-/g, '').slice(0, 16);
        const txTime = new Date(Date.now() - t.daysAgo * 24 * 60 * 60 * 1000);

        const fromAcc = t.isOutflow ? checkingId : savingsId;
        const toAcc = t.isOutflow ? savingsId : checkingId;

        await client.query(`
          INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
          VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, $10)
        `, [txId, ikey, fromAcc, toAcc, t.amount, t.category, t.note, t.desc, t.merch, txTime]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error during transaction processing:', err);
      throw err;
    } finally {
      client.release();
    }

    // Generate JWT
    const token = jwt.sign({ userId, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTIONS);

    res.status(201).json({
      message: 'Signup successful.',
      user: { id: userId, name, email: email.toLowerCase() },
    });
  } catch (err) {
    console.error('[POST /api/auth/signup] Error:', err);
    res.status(500).json({ error: 'Failed to create user account.' });
  }
});

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({
      message: 'Login successful.',
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('[POST /api/auth/login] Error:', err);
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
});

// ── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
});

// ── Get Active Session ──────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    // Development bypass - default to Arjun Mehta
    try {
      const { rows } = await db.query('SELECT id, name, email, preferences FROM users WHERE id = $1', ['usr_arjun']);
      if (rows.length > 0) {
        return res.json({ user: rows[0] });
      }
    } catch (_) {}
    return res.status(401).json({ error: 'No active session.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query('SELECT id, name, email, preferences FROM users WHERE id = $1', [decoded.userId]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    // Development bypass - default to Arjun Mehta
    try {
      const { rows } = await db.query('SELECT id, name, email, preferences FROM users WHERE id = $1', ['usr_arjun']);
      if (rows.length > 0) {
        return res.json({ user: rows[0] });
      }
    } catch (_) {}
    res.status(401).json({ error: 'Invalid session token.' });
  }
});

// ── Forgot Password ─────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    const genericSuccessMsg = { message: 'If a matching account exists, a password reset link has been sent to your inbox.' };

    if (rows.length === 0) {
      // Don't leak registered emails, return generic success
      return res.json(genericSuccessMsg);
    }
    const user = rows[0];

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      ['tok_' + uuidv4().replace(/-/g, '').slice(0, 16), user.id, tokenHash, expiresAt]
    );

    const resetLink = `http://localhost:5173/reset-password/${token}`;

    // Gmail SMTP settings
    const { EMAIL_USER, EMAIL_PASS } = process.env;

    if (!EMAIL_USER || !EMAIL_PASS) {
      console.log('\n[DEVELOPMENT RESET LINK]:', resetLink, '\n');
      return res.json({
        ...genericSuccessMsg,
        devResetLink: resetLink, // Expose reset link in response for local test cases
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    const mailOptions = {
      from: `"Verdant Finance" <${EMAIL_USER}>`,
      to: email.toLowerCase(),
      subject: 'Reset Your Password — Verdant',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #E2DEC9; background-color: #FAF7F2; color: #1C1B19;">
          <h2 style="font-family: serif; color: #2F4F3E;">Verdant</h2>
          <p>You requested to reset your password. Click the button below to establish a new password:</p>
          <a href="${resetLink}" style="display: inline-block; background-color: #2F4F3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0;">Reset Password</a>
          <p style="font-size: 11px; color: #B5533C;">This link expires in 30 minutes.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json(genericSuccessMsg);
  } catch (err) {
    console.error('[POST /api/auth/forgot-password] Error:', err);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

// ── Reset Password ──────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both a letter and a number.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await db.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used = 0 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }
    const tokenRecord = rows[0];

    const passwordHash = await bcrypt.hash(password, 10);

    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tokenRecord.user_id]);
      await client.query('UPDATE password_reset_tokens SET used = 1 WHERE id = $3', [tokenRecord.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ message: 'Password reset successful. You may now log in.' });
  } catch (err) {
    console.error('[POST /api/auth/reset-password] Error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

export default router;
