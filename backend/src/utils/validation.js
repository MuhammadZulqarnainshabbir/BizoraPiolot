import mongoose from 'mongoose';

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isText = (value, { required = false, max = 120 } = {}) =>
  typeof value === 'string' && (!required || Boolean(value.trim())) && value.trim().length <= max;

export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const isObjectId = (value) => mongoose.isValidObjectId(value);

export const isPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128;

/** Converts a currency amount (e.g. 12.5) to integer cents, or NaN if it has more than 2 decimals. */
export function toCents(value) {
  if (!isNumber(value)) return NaN;
  const cents = Math.round(value * 100);
  return Math.abs(cents - value * 100) < 1e-6 ? cents : NaN;
}

export function validationError(res, message) {
  return res.status(400).json({ message });
}

export function handleDataError(err, res, next, duplicateField) {
  if (duplicateField && err.code === 11000) {
    return res.status(409).json({ message: `${duplicateField} already exists for this shop` });
  }
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid shop record data' });
  }
  return next(err);
}

/** URL-friendly version of a shop name, used in employee login links (cosmetic; the shop id is authoritative). */
export function shopSlug(shopName) {
  const slug = String(shopName || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'shop';
}
