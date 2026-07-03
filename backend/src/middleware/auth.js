/**
 * auth.js — Auth Middleware (Direct Bypass to Arjun Mehta)
 */

export function authenticateUser(req, res, next) {
  // Auto-login as Arjun Mehta (usr_arjun) to bypass login page
  req.userId = 'usr_arjun';
  next();
}
