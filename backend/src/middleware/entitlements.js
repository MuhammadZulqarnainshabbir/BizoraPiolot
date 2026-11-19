import { FEATURES } from '../config/features.js';
import { entitlementsFor } from '../services/platform/subscriptionService.js';

/**
 * Shop-side enforcement of plan entitlements. Runs after `authenticate` + `loadShop`, and after
 * `authorize(permission)`: a user needs both the shop permission and the shop's plan to include
 * the feature. Only "create" style endpoints are gated, so existing records stay readable when a
 * plan is downgraded or lapses (the read-only policy).
 */
export const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    req.entitlements ??= await entitlementsFor(req.shop._id);
    if (req.entitlements.features.includes(featureKey)) return next();
    const label = FEATURES[featureKey]?.label ?? featureKey;
    return res.status(403).json({
      code: req.entitlements.lapsed ? 'SUBSCRIPTION_INACTIVE' : 'FEATURE_NOT_AVAILABLE',
      message: req.entitlements.lapsed
        ? `${label} is unavailable because the shop’s subscription has lapsed. Existing records stay available.`
        : `${label} isn’t included in the shop’s plan (${req.entitlements.planName})`
    });
  } catch (err) { next(err); }
};

/** Loads entitlements without blocking, for responses that show plan info or for limit checks. */
export const loadEntitlements = async (req, _res, next) => {
  try { req.entitlements ??= await entitlementsFor(req.shop._id); next(); } catch (err) { next(err); }
};

/** 409 when adding `adding` more would exceed a plan limit (`null` = unlimited). */
export function assertWithinLimit(entitlements, limitKey, current, adding, label) {
  const limit = entitlements?.limits?.[limitKey];
  if (limit === null || limit === undefined) return;
  if (current + adding > limit) {
    const err = new Error(`${label} limit reached for the ${entitlements.planName} plan (${limit}). Contact Bizora to upgrade.`);
    err.status = 409;
    err.code = 'PLAN_LIMIT';
    err.details = { limit, current, limitKey };
    throw err;
  }
}
