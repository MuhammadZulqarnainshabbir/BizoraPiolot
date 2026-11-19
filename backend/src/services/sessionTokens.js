import jwt from 'jsonwebtoken';
import { SESSION_LIMITS } from '../config/session.js';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

/**
 * Signs a session token for `role` ('owner' | 'employee').
 * `sessionStart` (seconds) is carried across renewals so the maximum session length holds.
 * Returns null when the session has reached its maximum length and can't be renewed.
 * `expiresIn` / `sessionEndsIn` (seconds) let the browser schedule warnings without
 * depending on its clock agreeing with the server's.
 */
export function issueSessionToken(role, claims, sessionStart = Math.floor(Date.now() / 1000)) {
  const { idleSeconds, maxSeconds } = SESSION_LIMITS[role];
  const now = Math.floor(Date.now() / 1000);
  const sessionEndsAt = sessionStart + maxSeconds;
  const exp = Math.min(now + idleSeconds, sessionEndsAt);
  if (exp <= now) return null;
  const token = jwt.sign({ ...claims, role, sst: sessionStart, exp }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  return { token, expiresIn: exp - now, sessionEndsIn: sessionEndsAt - now };
}

/** When the current session began; tokens issued before session tracking use their issue time. */
export const sessionStartOf = (payload) => payload.sst ?? payload.iat;
