import Shop from '../../models/Shop.js';
import { getSettings } from './subscriptionService.js';

/**
 * Shop lifecycle enforcement on the shop side. Only ACTIVE shops may sign in or use shop APIs.
 * Returns a response body ({ code, message }) when the shop is blocked, otherwise null.
 */
export async function shopStatusError(shop) {
  const status = shop?.status ?? 'ACTIVE';
  if (status === 'ACTIVE') return null;
  if (status === 'PENDING') return { code: 'SHOP_PENDING', message: 'This shop is awaiting approval by Bizora. You will be able to sign in once it is approved.' };
  if (status === 'DEACTIVATED') return { code: 'SHOP_DEACTIVATED', message: 'This shop has been deactivated. Please contact Bizora support.' };
  const settings = await getSettings();
  return { code: 'SHOP_SUSPENDED', message: settings.suspensionMessage || 'This shop has been suspended by Bizora. Please contact support.' };
}

/** Records a sign-in or renewal without waiting for it (the console shows "last activity"). */
export function touchShopActivity(shopId) {
  Shop.updateOne({ _id: shopId }, { $set: { lastActivityAt: new Date() } }).catch(() => {});
}

/** Shops created before the lifecycle existed are ACTIVE. Safe to run on every start. */
export async function backfillShopStatus() {
  const result = await Shop.updateMany({ status: { $exists: false } }, { $set: { status: 'ACTIVE' } });
  if (result.modifiedCount) console.log(`Marked ${result.modifiedCount} existing shop(s) as ACTIVE`);
}
