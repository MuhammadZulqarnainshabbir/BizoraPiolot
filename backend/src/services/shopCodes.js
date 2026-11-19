import { randomInt } from 'node:crypto';
import Shop from '../models/Shop.js';

/**
 * Shop codes: a short, unique, human-readable code per shop (e.g. "7K3QM2") that employees type
 * on the mobile app to say which shop they belong to, instead of the long employee login link.
 * It identifies the shop only; signing in still needs the employee's ID and password.
 */

// No 0/O or 1/I, so the code can be read out loud or copied from a note without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHOP_CODE_LENGTH = 6;
const MAX_ATTEMPTS = 20;

export const generateShopCode = () => Array.from({ length: SHOP_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Uppercases and drops spaces and dashes, so "7k3q-m2" and "7K3Q M2" both mean "7K3QM2". */
export const normalizeShopCode = (value) => String(value ?? '').replace(/[\s-]+/g, '').toUpperCase();

export const isShopCode = (value) => typeof value === 'string' && new RegExp(`^[${ALPHABET}]{${SHOP_CODE_LENGTH}}$`).test(normalizeShopCode(value));

/** Sets a fresh code on the shop, retrying if a random code is already taken. */
export async function assignShopCode(shopId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shopCode = generateShopCode();
    try {
      const shop = await Shop.findOneAndUpdate({ _id: shopId, shopCode: { $exists: false } }, { $set: { shopCode } }, { new: true });
      if (shop) return shop.shopCode;
      const existing = await Shop.findById(shopId).select('shopCode').lean();
      return existing?.shopCode ?? null;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new Error('Could not allocate a unique shop code');
}

/** Gives shops created before shop codes existed a code. Safe to run on every start. */
export async function backfillShopCodes() {
  const missing = await Shop.find({ shopCode: { $exists: false } }).select('_id').lean();
  for (const shop of missing) await assignShopCode(shop._id);
  if (missing.length) console.log(`Assigned shop codes to ${missing.length} existing shop(s)`);
}
