import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import PlatformAdmin from '../models/PlatformAdmin.js';
import { platformCan } from '../config/platformPermissions.js';

/**
 * Platform console authentication. Tokens are signed with the same secret as shop tokens but
 * carry `aud: 'platform'` and `role: 'platform-admin'`; the shop middleware rejects that role and
 * this middleware rejects everything else, so the two domains never cross.
 *
 * The admin record is read on every request: deactivation, "revoke sessions", logout and
 * password changes bump `tokenVersion`, which ends every older session immediately.
 */

export const PLATFORM_AUDIENCE = 'platform';
export const PLATFORM_SESSION_EXPIRED = 'Your platform session has expired. Please sign in again.';

function verifyPlatformBearer(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return { error: 'Platform authentication required' };
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: PLATFORM_AUDIENCE });
    if (payload.role !== 'platform-admin') return { error: 'Invalid platform token' };
    return { payload };
  } catch (err) {
    return { error: err.name === 'TokenExpiredError' ? PLATFORM_SESSION_EXPIRED : 'Invalid platform token' };
  }
}

/** Requires a live platform admin session. `scope: 'setup'` tokens may only reach MFA set-up and password change. */
export function authenticatePlatformAdmin({ allowSetupScope = false } = {}) {
  return async (req, res, next) => {
    const { payload, error } = verifyPlatformBearer(req);
    if (error) return res.status(401).json({ message: error });
    try {
      const admin = await PlatformAdmin.findById(payload.sub).select('+tokenVersion');
      if (!admin || admin.tokenVersion !== payload.ver) return res.status(401).json({ message: 'Your platform session has ended. Please sign in again.' });
      if (admin.status !== 'active') return res.status(403).json({ message: 'This administrator account is inactive.' });
      if (payload.scope === 'setup' && !allowSetupScope) {
        return res.status(403).json({ code: 'SETUP_REQUIRED', message: 'Finish setting up your account (password and multi-factor authentication) first.' });
      }
      req.platformAdmin = admin;
      req.platformToken = payload;
      next();
    } catch (err) { next(err); }
  };
}

/** Every platform endpoint names the permission it needs; roles without it get 403. Deny by default. */
export const requirePlatformPermission = (...permissions) => (req, res, next) => {
  if (permissions.every(p => platformCan(req.platformAdmin, p))) return next();
  return res.status(403).json({ code: 'FORBIDDEN', message: 'Your platform role doesn’t allow that' });
};

const skipInTests = () => process.env.NODE_ENV === 'test';

/** Sign-in attempts per IP. Account lockout (per email) is enforced separately in the service. */
export const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skip: skipInTests,
  message: { message: 'Too many sign-in attempts, please try again later' }
});

/** General ceiling for the privileged API, per IP. */
export const platformApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, skip: skipInTests,
  message: { message: 'Too many requests, please try again later' }
});
