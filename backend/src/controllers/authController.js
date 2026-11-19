import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import Shop from '../models/Shop.js';
import { isMailConfigured, sendPasswordResetEmail } from '../config/mailer.js';
import { shopSlug } from '../utils/validation.js';
import { permissionsFor } from '../config/permissions.js';
import { isValidTimeZone } from '../utils/time.js';
import { SESSION_EXPIRED_MESSAGE, issueSessionToken, sessionStartOf } from '../services/sessionTokens.js';
import { generateShopCode } from '../services/shopCodes.js';
import { shopStatusError, touchShopActivity } from '../services/platform/shopStatus.js';
import { getSettings } from '../services/platform/subscriptionService.js';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicShop = (shop) => ({
  id: shop.id, shopName: shop.shopName, slug: shopSlug(shop.shopName), shopCode: shop.shopCode ?? null, ownerName: shop.ownerName, email: shop.email, phone: shop.phone, address: shop.address,
  timezone: shop.timezone || 'Asia/Karachi', ntn: shop.ntn ?? '', strn: shop.strn ?? '', receiptNote: shop.receiptNote ?? ''
});
/** What the owner may do (everything in config/permissions.js); the frontend uses it to show the right actions. */
const OWNER_PERMISSIONS = permissionsFor('owner');
const resetTokenHash = (token) => createHash('sha256').update(token).digest('hex');
export async function register(req, res, next) {
  try {
    const { shopName, ownerName, email, phone, address, password, confirmPassword } = req.body || {};
    const fields = [shopName, ownerName, email, phone, address, password, confirmPassword];
    if (fields.some(v => typeof v !== 'string' || !v.trim())) return res.status(400).json({ message: 'All fields are required' });
    if ([shopName, ownerName, phone, address].some(v => v.trim().length > 200)) return res.status(400).json({ message: 'Field is too long' });
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ message: 'Invalid email address' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be 8–128 characters' });
    if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await Shop.exists({ email: normalizedEmail })) return res.status(409).json({ message: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    // Platform setting: new shops are ACTIVE at once, or PENDING until a platform admin approves them.
    const status = (await getSettings()).registrationApproval === 'manual' ? 'PENDING' : 'ACTIVE';
    const values = { shopName: shopName.trim(), ownerName: ownerName.trim(), email: normalizedEmail, phone: phone.trim(), address: address.trim(), passwordHash, status, statusChangedAt: new Date() };
    // A random shop code can (very rarely) collide with an existing one: draw another and retry.
    let shop;
    for (let attempt = 0; ; attempt++) {
      try {
        shop = await Shop.create({ ...values, shopCode: generateShopCode() });
        break;
      } catch (err) {
        if (err.code === 11000 && /shopCode/.test(err.message) && attempt < 20) continue;
        throw err;
      }
    }
    return res.status(201).json({ message: status === 'PENDING' ? 'Shop registered. Bizora will review and approve it before you can sign in.' : 'Shop registered successfully', shop: publicShop(shop), pendingApproval: status === 'PENDING' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Email already registered' });
    next(err);
  }
}
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required' });
    const shop = await Shop.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (!shop || !(await bcrypt.compare(password, shop.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
    const blocked = await shopStatusError(shop);
    if (blocked) return res.status(403).json(blocked);
    touchShopActivity(shop._id);
    return res.json({ ...issueSessionToken('owner', { sub: shop.id }), shop: publicShop(shop), permissions: OWNER_PERMISSIONS });
  } catch (err) { next(err); }
}

/** Renews the owner's session while they're active, up to the maximum session length. */
export async function refresh(req, res, next) {
  try {
    const current = await Shop.findById(req.shopId).select('status').lean();
    if (!current) return res.status(401).json({ message: 'Shop account not found' });
    const blocked = await shopStatusError(current);
    if (blocked) return res.status(403).json(blocked);
    touchShopActivity(current._id);
    const grant = issueSessionToken('owner', { sub: req.shopId }, sessionStartOf(req.tokenPayload));
    if (!grant) return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE });
    return res.json(grant);
  } catch (err) { next(err); }
}
export async function forgotPassword(req, res, next) {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !emailPattern.test(email.trim()) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address' });
  }
  if (!isMailConfigured()) return res.status(503).json({ message: 'Password reset email is not configured on this server' });

  try {
    const shop = await Shop.findOne({ email: email.trim().toLowerCase() });
    if (!shop) return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });

    const token = randomBytes(32).toString('hex');
    const tokenHash = resetTokenHash(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await Shop.updateOne(
      { _id: shop._id },
      { $set: { resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: expiresAt } }
    );

    try {
      await sendPasswordResetEmail({ email: shop.email, shopName: shop.shopName, token });
    } catch (err) {
      await Shop.updateOne(
        { _id: shop._id, resetPasswordTokenHash: tokenHash },
        { $unset: { resetPasswordTokenHash: 1, resetPasswordExpiresAt: 1 } }
      );
      return next(err);
    }

    return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
  } catch (err) {
    return next(err);
  }
}

export async function resetPassword(req, res, next) {
  const { token, password, confirmPassword } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ message: 'This password reset link is invalid or has expired' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Password must be 8–128 characters' });
  }
  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const shop = await Shop.findOneAndUpdate(
      {
        resetPasswordTokenHash: resetTokenHash(token),
        resetPasswordExpiresAt: { $gt: new Date() }
      },
      {
        $set: { passwordHash },
        $unset: { resetPasswordTokenHash: 1, resetPasswordExpiresAt: 1 }
      },
      { new: true, runValidators: true }
    );
    if (!shop) return res.status(400).json({ message: 'This password reset link is invalid or has expired' });
    return res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    return next(err);
  }
}

export async function me(req, res, next) {
  try {
    const shop = await Shop.findById(req.shopId);
    if (!shop) return res.status(401).json({ message: 'Shop account not found' });
    const blocked = await shopStatusError(shop);
    if (blocked) return res.status(403).json(blocked);
    return res.json({ shop: publicShop(shop), permissions: OWNER_PERMISSIONS });
  } catch (err) { next(err); }
}

/**
 * Owner updates shop settings: the timezone used for "today", reports and due dates, and the
 * details printed on receipts (NTN, STRN, the shop's own terms). Only the fields sent change.
 */
export async function updateShopSettings(req, res, next) {
  const { timezone, ntn, strn, receiptNote } = req.body || {};
  const changes = {};
  if (timezone !== undefined) {
    if (!isValidTimeZone(timezone)) return res.status(400).json({ message: 'Choose a valid timezone' });
    changes.timezone = timezone;
  }
  for (const [key, value, max] of [['ntn', ntn, 30], ['strn', strn, 30], ['receiptNote', receiptNote, 1000]]) {
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length > max) return res.status(400).json({ message: `${key === 'ntn' ? 'NTN' : key === 'strn' ? 'STRN' : 'Receipt note'} must be at most ${max} characters` });
    changes[key] = value.trim();
  }
  if (!Object.keys(changes).length) return res.status(400).json({ message: 'Nothing to change' });
  try {
    const shop = await Shop.findByIdAndUpdate(req.shopId, { $set: changes }, { new: true });
    if (!shop) return res.status(401).json({ message: 'Shop account not found' });
    return res.json({ shop: publicShop(shop) });
  } catch (err) { next(err); }
}
