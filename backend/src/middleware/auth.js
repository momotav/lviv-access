/**
 * Express middleware that reads the Authorization header and attaches
 * the decoded user to req.user if a valid token is present.
 *
 * - requireAuth: rejects with 401 if no valid token
 * - optionalAuth: attaches req.user if present, doesn't reject otherwise
 */

import { verifyToken } from '../services/auth.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.substring(7);
}

export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = { id: payload.sub, email: payload.email, name: payload.name };
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}
