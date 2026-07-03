/**
 * users.js — User profile and settings endpoints
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all endpoints in this file
router.use(authenticateUser);

// ── PATCH /api/users/me ─────────────────────────────────────────────────────
// Update user's name
router.patch('/me', (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Display name cannot be empty.' });
  }

  try {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), req.userId);
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

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  try {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.userId);

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[PATCH /api/users/me/password Error]:', err);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

// ── PATCH /api/users/me/preferences ─────────────────────────────────────────
// Update preference JSON
router.patch('/me/preferences', (req, res) => {
  const { compact } = req.body;

  if (compact === undefined || typeof compact !== 'boolean') {
    return res.status(400).json({ error: 'Compact preference must be a boolean.' });
  }

  try {
    const preferencesString = JSON.stringify({ compact });
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(preferencesString, req.userId);

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
