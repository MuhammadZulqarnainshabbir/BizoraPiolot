import bcrypt from 'bcryptjs';
import Employee from '../models/Employee.js';
import { SESSION_EXPIRED_MESSAGE, issueSessionToken, sessionStartOf } from '../services/sessionTokens.js';
import Shop from '../models/Shop.js';
import { effectivePermissions } from '../config/permissions.js';
import { isShopCode, normalizeShopCode } from '../services/shopCodes.js';
import { isObjectId, isPassword, shopSlug, validationError } from '../utils/validation.js';
import { shopStatusError, touchShopActivity } from '../services/platform/shopStatus.js';

// Compared against when the employee ID doesn't exist, so response time doesn't reveal valid IDs.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
const INVALID_LOGIN = 'Invalid employee ID or password';
const INVALID_SHOP_CODE_LOGIN = 'Invalid shop code, employee ID or password';

const publicShopInfo = (shop) => ({ id: shop.id, shopName: shop.shopName, slug: shopSlug(shop.shopName), shopCode: shop.shopCode ?? null, timezone: shop.timezone || 'Asia/Karachi' });
const publicEmployee = (employee) => ({
  id: employee.id,
  employeeId: employee.employeeId,
  name: employee.name,
  email: employee.email,
  role: employee.role,
  /** 'employee' or 'manager'; the permissions list says what that means for this account. */
  accessRole: employee.accessRole ?? 'employee',
  mustChangePassword: employee.mustChangePassword
});

/** The session as the apps keep it: profile, shop, and what the account may do right now. */
const sessionBody = (employee, shop) => ({ employee: publicEmployee(employee), shop: publicShopInfo(shop), permissions: effectivePermissions(employee) });

/** A session token for the employee; pass `sessionStart` to keep renewing the same session. */
const grantFor = (employee, sessionStart) => issueSessionToken(
  'employee',
  { sub: employee.id, shopId: String(employee.shopId), ver: employee.tokenVersion },
  sessionStart
);

/** Public: just enough for the shop-specific login page to show which shop it belongs to. */
export async function shopInfo(req, res, next) {
  if (!isObjectId(req.params.shopId)) return res.status(404).json({ message: 'Shop not found' });
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    return res.json({ shop: publicShopInfo(shop) });
  } catch (err) { return next(err); }
}

/** Public: the shop behind a shop code, for the mobile app's employee sign-in. */
export async function shopInfoByCode(req, res, next) {
  if (!isShopCode(req.params.code)) return res.status(404).json({ message: 'Shop not found' });
  try {
    const shop = await Shop.findOne({ shopCode: normalizeShopCode(req.params.code) });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    return res.json({ shop: publicShopInfo(shop) });
  } catch (err) { return next(err); }
}

/**
 * Employee sign-in. The shop is named by `shopId` (web app, from the shop's login link) or by
 * `shopCode` (mobile app). The employee ID is looked up within that shop only, so an employee of
 * one shop can never sign in to another; a wrong shop code gets the same answer as a wrong password.
 */
export async function login(req, res, next) {
  const { shopId, shopCode, employeeId, password } = req.body || {};
  const byCode = shopCode !== undefined && shopCode !== null && shopCode !== '';
  if (typeof employeeId !== 'string' || typeof password !== 'string' || !employeeId.trim() || employeeId.length > 20 || password.length > 128) {
    return validationError(res, byCode ? 'Shop code, employee ID and password are required' : 'Employee ID and password are required');
  }
  if (byCode ? typeof shopCode !== 'string' || !shopCode.trim() : !isObjectId(shopId)) {
    return validationError(res, byCode ? 'Shop code, employee ID and password are required' : 'Employee ID and password are required');
  }
  const invalid = byCode ? INVALID_SHOP_CODE_LOGIN : INVALID_LOGIN;
  try {
    const shop = byCode
      ? (isShopCode(shopCode) ? await Shop.findOne({ shopCode: normalizeShopCode(shopCode) }) : null)
      : await Shop.findById(shopId);
    const employee = shop ? await Employee.findOne({ shopId: shop._id, employeeId: employeeId.trim().toUpperCase() }).select('+passwordHash +tokenVersion') : null;
    const matches = await bcrypt.compare(password, employee?.passwordHash || DUMMY_HASH);
    if (!shop || !employee || !employee.passwordHash || !matches) return res.status(401).json({ message: invalid });
    if (employee.status !== 'active') return res.status(403).json({ message: 'This employee account is inactive. Contact the shop owner.' });
    const blocked = await shopStatusError(shop);
    if (blocked) return res.status(403).json(blocked);
    touchShopActivity(shop._id);
    return res.json({ ...grantFor(employee), ...sessionBody(employee, shop) });
  } catch (err) { return next(err); }
}

export async function me(req, res, next) {
  try {
    const shop = await Shop.findById(req.shopId);
    if (!shop) return res.status(401).json({ message: 'Shop not found' });
    const blocked = await shopStatusError(shop);
    if (blocked) return res.status(403).json(blocked);
    return res.json(sessionBody(req.employee, shop));
  } catch (err) { return next(err); }
}

/**
 * Renews the employee's session while they're active, up to the maximum session length.
 * Also returns the current profile and permissions, so a promotion, demotion or permission
 * change reaches the app at the next renewal without signing the user out.
 */
export async function refresh(req, res, next) {
  const grant = grantFor(req.employee, sessionStartOf(req.tokenPayload));
  if (!grant) return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE });
  try {
    const shop = await Shop.findById(req.shopId);
    if (!shop) return res.status(401).json({ message: 'Shop not found' });
    return res.json({ ...grant, ...sessionBody(req.employee, shop) });
  } catch (err) { return next(err); }
}

/** Also used for the forced first-login change. Returns a fresh token because the old one is revoked. */
export async function changePassword(req, res, next) {
  const { currentPassword, password, confirmPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword) return validationError(res, 'Enter your current password');
  if (!isPassword(password)) return validationError(res, 'New password must be 8–128 characters');
  if (password !== confirmPassword) return validationError(res, 'Passwords do not match');
  if (password === currentPassword) return validationError(res, 'Choose a password different from your current one');
  try {
    const current = await Employee.findById(req.employee._id).select('+passwordHash');
    if (!current?.passwordHash || !(await bcrypt.compare(currentPassword, current.passwordHash))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const employee = await Employee.findOneAndUpdate(
      { _id: req.employee._id },
      { $set: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false }, $inc: { tokenVersion: 1 } },
      { new: true, projection: '+tokenVersion' }
    );
    // Same session continues (the old token is revoked by the version bump, not the clock).
    const grant = grantFor(employee, sessionStartOf(req.tokenPayload));
    if (!grant) return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE });
    return res.json({ ...grant, employee: publicEmployee(employee), permissions: effectivePermissions(employee) });
  } catch (err) { return next(err); }
}
