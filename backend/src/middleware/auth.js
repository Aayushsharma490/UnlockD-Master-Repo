/**
 * auth.js — Auth Middleware (PostgreSQL + JWT verification + Dev fallback)
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function authenticateUser(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    // Development bypass - default to Arjun Mehta
    req.userId = 'usr_arjun';
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    // Fail-safe development bypass
    req.userId = 'usr_arjun';
    next();
  }
}
