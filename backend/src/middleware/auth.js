/**
 * auth.js — Auth Middleware
 * Verifies JWT tokens stored in httpOnly cookies.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'verdant_fallback_secret_key_1337';

export function authenticateUser(req, res, next) {
  // Read token from cookies (requires cookie-parser to be registered in index.js)
  const token = req.cookies?.jwt;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.warn('[Auth Middleware] Invalid token presented:', err.message);
    // Clear cookie if it's invalid/expired to prevent infinite loops
    res.clearCookie('jwt');
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
