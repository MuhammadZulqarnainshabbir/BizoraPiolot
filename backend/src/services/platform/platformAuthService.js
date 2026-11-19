import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import PlatformAdmin from '../../models/PlatformAdmin.js';
import { PLATFORM_ROLES, platformPermissionsFor } from '../../config/platformPermissions.js';
import { PLATFORM_AUDIENCE } from '../../middleware/platformAuth.js';
import { ApiError } from '../../utils/http.js';
import { generateSecret, otpauthUri, verifyTotp } from './totp.js';

// Platform admin sign-in, sessions, MFA and provisioning.

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 12;

const positive = (value, fallback) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; };
/** Idle and maximum session length for the console (shorter than shop sessions: it is a privileged console). */
export const PLATFORM_SESSION = {
  idleSeconds: Math.round(positive(process.env.PLATFORM_ADMIN_IDLE_MINUTES, 15) * 60),
  maxSeconds: Math.round(positive(process.env.PLATFORM_ADMIN_MAX_HOURS, 8) * 3600)
};
/** When true, every admin must have MFA enabled to use the console (a login without it gets a set-up-only token). */
export const mfaRequired = () => /^(1|true|yes)$/i.test(process.env.PLATFORM_ADMIN_REQUIRE_MFA ?? '');

export const isStrongPassword = (value) => typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
export const PASSWORD_RULE = 'Password must be 12–128 characters with upper and lower case letters and a digit';

export const publicAdmin = (admin) => ({
  id: admin.id, email: admin.email, name: admin.name, role: admin.role, status: admin.status,
  mustChangePassword: admin.mustChangePassword, mfaEnabled: Boolean(admin.mfa?.enabled), lastLoginAt: admin.lastLoginAt ?? null,
  permissions: platformPermissionsFor(admin.role)
});

/** Signs a session token; `sessionStart` carries across renewals so the maximum length holds. */
export function issuePlatformToken(admin, { scope, sessionStart = Math.floor(Date.now() / 1000) } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const sessionEndsAt = sessionStart + PLATFORM_SESSION.maxSeconds;
  const exp = Math.min(now + PLATFORM_SESSION.idleSeconds, sessionEndsAt);
  if (exp <= now) return null;
  const claims = { sub: admin.id, role: 'platform-admin', aud: PLATFORM_AUDIENCE, ver: admin.tokenVersion, sst: sessionStart, exp, ...(scope ? { scope } : {}) };
  return { token: jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS256' }), expiresIn: exp - now, sessionEndsIn: sessionEndsAt - now, scope: scope ?? 'full' };
}

/** A setup-only session is issued while the account still needs a password change or MFA enrolment. */
export const needsSetup = (admin) => admin.mustChangePassword || (mfaRequired() && !admin.mfa?.enabled);

/**
 * Checks email, password and (when enabled) the TOTP code. Wrong credentials count towards a
 * temporary lockout; the response never says which part was wrong.
 * Returns { admin } or throws an ApiError (401/403/423).
 */
export async function authenticate({ email, password, totp }) {
  const admin = await PlatformAdmin.findOne({ email: String(email ?? '').trim().toLowerCase() }).select('+passwordHash +tokenVersion +mfa.secret');
  const matches = await bcrypt.compare(String(password ?? ''), admin?.passwordHash || DUMMY_HASH);
  if (admin && admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new ApiError(423, `Too many failed attempts. Try again in ${Math.ceil((admin.lockedUntil - Date.now()) / 60000)} minutes.`, 'LOCKED');
  }
  if (!admin || !matches) {
    if (admin) {
      const failed = (admin.failedLogins ?? 0) + 1;
      await PlatformAdmin.updateOne({ _id: admin._id }, { $set: { failedLogins: failed, ...(failed >= MAX_FAILED_LOGINS ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : {}) } });
    }
    throw new ApiError(401, 'Invalid email, password or code', 'INVALID_LOGIN');
  }
  if (admin.status !== 'active') throw new ApiError(403, 'This administrator account is inactive.', 'INACTIVE');
  if (admin.mfa?.enabled) {
    if (!totp) throw new ApiError(401, 'Enter the 6-digit code from your authenticator app', 'MFA_REQUIRED');
    if (!verifyTotp(admin.mfa.secret, totp)) {
      await PlatformAdmin.updateOne({ _id: admin._id }, { $inc: { failedLogins: 1 } });
      throw new ApiError(401, 'Invalid email, password or code', 'INVALID_LOGIN');
    }
  }
  await PlatformAdmin.updateOne({ _id: admin._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
  return { admin };
}

export async function changePassword(admin, currentPassword, password) {
  const current = await PlatformAdmin.findById(admin._id).select('+passwordHash');
  if (!current || !(await bcrypt.compare(String(currentPassword ?? ''), current.passwordHash))) throw new ApiError(400, 'Current password is incorrect');
  if (!isStrongPassword(password)) throw new ApiError(400, PASSWORD_RULE);
  if (password === currentPassword) throw new ApiError(400, 'Choose a password different from your current one');
  // Bumping the version signs every other session out; the caller issues a fresh token for this one.
  return PlatformAdmin.findOneAndUpdate({ _id: admin._id }, { $set: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false }, $inc: { tokenVersion: 1 } }, { new: true, projection: '+tokenVersion' });
}

export async function beginMfaSetup(admin) {
  const secret = generateSecret();
  await PlatformAdmin.updateOne({ _id: admin._id }, { $set: { 'mfa.secret': secret, 'mfa.enabled': false } });
  return { secret, otpauth: otpauthUri(secret, admin.email) };
}

export async function enableMfa(admin, code) {
  const current = await PlatformAdmin.findById(admin._id).select('+mfa.secret +tokenVersion');
  if (!current?.mfa?.secret) throw new ApiError(400, 'Start MFA set-up first');
  if (!verifyTotp(current.mfa.secret, code)) throw new ApiError(400, 'That code is not valid. Check the time on your phone and try again.');
  return PlatformAdmin.findOneAndUpdate({ _id: admin._id }, { $set: { 'mfa.enabled': true, 'mfa.enabledAt': new Date() } }, { new: true, projection: '+tokenVersion' });
}

/** Ends every session of the admin (logout, revoke, deactivate). */
export const revokeSessions = (adminId) => PlatformAdmin.updateOne({ _id: adminId }, { $inc: { tokenVersion: 1 } });

/** A random temporary password, returned once to the super admin who creates or resets an account. */
export const temporaryPassword = () => `Tmp-${randomBytes(9).toString('base64url')}-${randomBytes(2).readUInt16BE(0) % 10}A`;

/**
 * Creates a platform admin. Used by the provisioning script (first SUPER_ADMIN) and by super
 * admins in the console. The password must be supplied by the caller; nothing is defaulted.
 */
export async function createPlatformAdmin({ email, name, role, password, createdBy = null, mustChangePassword = true }) {
  if (!PLATFORM_ROLES.includes(role)) throw new ApiError(400, `Role must be one of: ${PLATFORM_ROLES.join(', ')}`);
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new ApiError(400, 'Enter a valid email address');
  if (typeof name !== 'string' || !name.trim()) throw new ApiError(400, 'Name is required');
  if (!isStrongPassword(password)) throw new ApiError(400, PASSWORD_RULE);
  if (await PlatformAdmin.exists({ email: email.trim().toLowerCase() })) throw new ApiError(409, 'An administrator with this email already exists');
  return PlatformAdmin.create({ email: email.trim().toLowerCase(), name: name.trim(), role, passwordHash: await bcrypt.hash(password, 12), createdBy, mustChangePassword });
}
