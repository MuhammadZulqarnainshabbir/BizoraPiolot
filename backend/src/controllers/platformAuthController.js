import PlatformAdmin from '../models/PlatformAdmin.js';
import { PLATFORM_SESSION_EXPIRED } from '../middleware/platformAuth.js';
import { platformAudit } from '../services/platform/platformAudit.js';
import * as auth from '../services/platform/platformAuthService.js';
import { handle } from '../utils/http.js';

// /api/v1/platform-admin/auth

const grant = (admin, sessionStart) => {
  const scope = auth.needsSetup(admin) ? 'setup' : undefined;
  return auth.issuePlatformToken(admin, { scope, sessionStart });
};

export const login = handle(async (req, res) => {
  const { email, password, totp } = req.body || {};
  try {
    const { admin } = await auth.authenticate({ email, password, totp });
    const fresh = await PlatformAdmin.findById(admin._id).select('+tokenVersion');
    const session = grant(fresh);
    await platformAudit(req, { action: 'PLATFORM_LOGIN', adminEmail: fresh.email, targetType: 'PlatformAdmin', targetId: fresh._id, after: { scope: session.scope } });
    req.platformAdmin = fresh;
    return res.json({ ...session, admin: auth.publicAdmin(fresh), mfaRequired: auth.mfaRequired(), setupRequired: session.scope === 'setup' });
  } catch (err) {
    if (err.status && err.status < 500) await platformAudit(req, { action: 'PLATFORM_LOGIN_FAILED', adminEmail: String(email ?? '').trim().toLowerCase().slice(0, 254), outcome: 'failure', after: { code: err.code ?? '' } });
    throw err;
  }
});

export const me = (req, res) => res.json({ admin: auth.publicAdmin(req.platformAdmin), mfaRequired: auth.mfaRequired(), setupRequired: auth.needsSetup(req.platformAdmin) });

export const refresh = handle(async (req, res) => {
  const session = grant(req.platformAdmin, req.platformToken.sst ?? req.platformToken.iat);
  if (!session) return res.status(401).json({ message: PLATFORM_SESSION_EXPIRED });
  return res.json({ ...session, admin: auth.publicAdmin(req.platformAdmin), setupRequired: session.scope === 'setup' });
});

/** Ends every session of this admin (the console's own too). */
export const logout = handle(async (req, res) => {
  await auth.revokeSessions(req.platformAdmin._id);
  await platformAudit(req, { action: 'PLATFORM_LOGOUT', targetType: 'PlatformAdmin', targetId: req.platformAdmin._id });
  return res.status(204).end();
});

export const changePassword = handle(async (req, res) => {
  const { currentPassword, password } = req.body || {};
  const updated = await auth.changePassword(req.platformAdmin, currentPassword, password);
  await platformAudit(req, { action: 'PLATFORM_PASSWORD_CHANGED', targetType: 'PlatformAdmin', targetId: req.platformAdmin._id });
  const session = grant(updated, req.platformToken.sst);
  return res.json({ ...session, admin: auth.publicAdmin(updated), setupRequired: session.scope === 'setup' });
});

export const mfaSetup = handle(async (req, res) => {
  if (req.platformAdmin.mfa?.enabled) return res.status(409).json({ message: 'Multi-factor authentication is already enabled' });
  const { secret, otpauth } = await auth.beginMfaSetup(req.platformAdmin);
  // The secret is shown once, to this admin only, and never logged.
  return res.json({ secret, otpauth });
});

export const mfaEnable = handle(async (req, res) => {
  const updated = await auth.enableMfa(req.platformAdmin, req.body?.code);
  await platformAudit(req, { action: 'PLATFORM_MFA_ENABLED', targetType: 'PlatformAdmin', targetId: req.platformAdmin._id });
  const session = grant(updated, req.platformToken.sst);
  return res.json({ ...session, admin: auth.publicAdmin(updated), setupRequired: session.scope === 'setup' });
});
