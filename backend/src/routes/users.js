/**
 * users.js — User profile and settings endpoints (PostgreSQL)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all endpoints in this file
router.use(authenticateUser);

function isValidPassword(password) {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

// ── PATCH /api/users/me ─────────────────────────────────────────────────────
// Update user's name
router.patch('/me', async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Display name cannot be empty.' });
  }

  try {
    await db.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.userId]);
    return res.json({ message: 'Profile updated successfully.', name: name.trim() });
  } catch (err) {
    console.error('[PATCH /api/users/me Error]:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── PATCH /api/users/me/password ────────────────────────────────────────────
// Update password after verifying old one
router.patch('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long and contain both a letter and a number.' });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[PATCH /api/users/me/password Error]:', err);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

// ── PATCH /api/users/me/preferences ─────────────────────────────────────────
// Update preference JSON
router.patch('/me/preferences', async (req, res) => {
  const { compact } = req.body;

  if (compact === undefined || typeof compact !== 'boolean') {
    return res.status(400).json({ error: 'Compact preference must be a boolean.' });
  }

  try {
    const preferencesJson = { compact };
    await db.query('UPDATE users SET preferences = $1 WHERE id = $2', [JSON.stringify(preferencesJson), req.userId]);

    return res.json({
      message: 'Preferences updated successfully.',
      preferences: { compact },
    });
  } catch (err) {
    console.error('[PATCH /api/users/me/preferences Error]:', err);
    return res.status(500).json({ error: 'Failed to save preferences.' });
  }
});

export default router;
