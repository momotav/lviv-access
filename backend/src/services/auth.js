/**
 * Authentication service.
 *
 * - Passwords hashed with bcrypt (10 rounds).
 * - JWTs signed with HS256, configurable lifetime.
 * - JWT_SECRET must be set in environment.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const TOKEN_LIFETIME = '14d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.display_name },
    getSecret(),
    { expiresIn: TOKEN_LIFETIME }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
}
