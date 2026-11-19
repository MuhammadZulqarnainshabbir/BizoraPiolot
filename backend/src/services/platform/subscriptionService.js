import { DEFAULT_PLANS, FEATURES, FEATURE_KEYS, SUBSCRIPTION_STATUSES, isFeatureKey } from '../../config/features.js';
import FeatureOverride from '../../models/FeatureOverride.js';
import PlatformSetting from '../../models/PlatformSetting.js';
import ShopSubscription from '../../models/ShopSubscription.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';
import { ApiError } from '../../utils/http.js';

// Plans, subscriptions, feature overrides and the entitlements a shop ends up with.

/** Seeds the default plans and the settings document on first start. Repeatable; never overwrites edits. */
export async function seedPlatformDefaults() {
  for (const plan of DEFAULT_PLANS) {
    await SubscriptionPlan.updateOne({ key: plan.key }, { $setOnInsert: plan }, { upsert: true });
  }
  await PlatformSetting.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });
}

export const getSettings = async () => (await PlatformSetting.findOne({ key: 'default' }).lean()) ?? { registrationApproval: 'automatic', defaultPlanKey: 'FREE_TRIAL', suspensionMessage: 'This shop has been suspended by Bizora. Please contact support.' };

export const listPlans = () => SubscriptionPlan.find().sort({ sortOrder: 1, key: 1 }).lean();

const nullableLimit = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(400, `${label} must be a whole number of zero or more, or empty for unlimited`);
  return n;
};

/** Validated plan fields from a create/update body (partial on update). */
export function planFields(input = {}, { partial = false } = {}) {
  const has = (k) => !partial || input[k] !== undefined;
  const out = {};
  if (has('name')) { if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new ApiError(400, 'Plan name is required (up to 80 characters)'); out.name = input.name.trim(); }
  if (has('description')) { if (typeof (input.description ?? '') !== 'string' || (input.description ?? '').length > 300) throw new ApiError(400, 'Description must be at most 300 characters'); out.description = (input.description ?? '').trim(); }
  if (has('priceCents')) { const n = Number(input.priceCents ?? 0); if (!Number.isInteger(n) || n < 0) throw new ApiError(400, 'Price must be a whole number of paisa, zero or more'); out.priceCents = n; }
  if (has('billingPeriod')) { if (!['MONTH', 'YEAR'].includes(input.billingPeriod ?? 'MONTH')) throw new ApiError(400, 'Billing period must be MONTH or YEAR'); out.billingPeriod = input.billingPeriod ?? 'MONTH'; }
  if (has('trialDays')) { const n = Number(input.trialDays ?? 0); if (!Number.isInteger(n) || n < 0 || n > 365) throw new ApiError(400, 'Trial days must be between 0 and 365'); out.trialDays = n; }
  if (has('limits')) {
    const l = input.limits ?? {};
    out.limits = { maxEmployees: nullableLimit(l.maxEmployees, 'Maximum employees'), maxInventoryUnits: nullableLimit(l.maxInventoryUnits, 'Inventory capacity'), maxBranches: nullableLimit(l.maxBranches, 'Maximum branches') };
  }
  if (has('features')) {
    const f = input.features ?? [];
    if (!Array.isArray(f) || f.some(k => !isFeatureKey(k))) throw new ApiError(400, `Features must be from: ${FEATURE_KEYS.join(', ')}`);
    out.features = [...new Set(f)];
  }
  if (has('active')) out.active = Boolean(input.active);
  if (has('sortOrder')) { const n = Number(input.sortOrder ?? 0); if (!Number.isInteger(n)) throw new ApiError(400, 'Sort order must be a whole number'); out.sortOrder = n; }
  return out;
}

export async function createPlan(body = {}) {
  const key = String(body.key ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(key)) throw new ApiError(400, 'Plan key must be 2–40 characters: letters, digits and underscores');
  if (await SubscriptionPlan.exists({ key })) throw new ApiError(409, 'A plan with this key already exists');
  const fields = planFields(body);
  if (!fields.name) throw new ApiError(400, 'Plan name is required (up to 80 characters)');
  return SubscriptionPlan.create({ key, ...fields });
}

export async function updatePlan(key, body = {}) {
  const fields = planFields(body, { partial: true });
  if (!Object.keys(fields).length) throw new ApiError(400, 'Nothing to change');
  const plan = await SubscriptionPlan.findOneAndUpdate({ key: String(key).toUpperCase() }, { $set: fields }, { new: true, runValidators: true });
  if (!plan) throw new ApiError(404, 'Plan not found');
  return plan;
}

/** Sets or replaces a shop's subscription (no payment is taken; this records what the business agreed). */
export async function setShopSubscription(shopId, body = {}, adminId) {
  const planKey = String(body.planKey ?? '').trim().toUpperCase();
  const plan = await SubscriptionPlan.findOne({ key: planKey }).lean();
  if (!plan) throw new ApiError(400, 'Choose an existing plan');
  const status = body.status ?? (plan.trialDays > 0 ? 'TRIAL' : 'ACTIVE');
  if (!SUBSCRIPTION_STATUSES.includes(status)) throw new ApiError(400, `Status must be one of: ${SUBSCRIPTION_STATUSES.join(', ')}`);
  const date = (value, label) => { if (value === undefined || value === null || value === '') return null; const d = new Date(value); if (Number.isNaN(d.getTime())) throw new ApiError(400, `${label} must be a date`); return d; };
  const startsAt = date(body.startsAt, 'Start date') ?? new Date();
  const endsAt = date(body.endsAt, 'End date');
  const trialEndsAt = date(body.trialEndsAt, 'Trial end') ?? (status === 'TRIAL' && plan.trialDays ? new Date(startsAt.getTime() + plan.trialDays * 86_400_000) : null);
  const notes = String(body.notes ?? '').trim().slice(0, 500);
  const billingReference = String(body.billingReference ?? '').trim().slice(0, 120);
  return ShopSubscription.findOneAndUpdate(
    { shopId },
    { $set: { planKey, status, startsAt, endsAt, trialEndsAt, notes, billingReference, updatedBy: adminId } },
    { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
  );
}

export async function setFeatureOverride(shopId, featureKey, { enabled, reason }, adminId) {
  if (!isFeatureKey(featureKey)) throw new ApiError(400, 'Unknown feature');
  if (typeof enabled !== 'boolean') throw new ApiError(400, 'enabled must be true or false');
  return FeatureOverride.findOneAndUpdate(
    { shopId, featureKey },
    { $set: { enabled, reason: String(reason ?? '').trim().slice(0, 500), changedBy: adminId } },
    { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
  );
}

export const removeFeatureOverride = (shopId, featureKey) => FeatureOverride.findOneAndDelete({ shopId, featureKey }).lean();

/** A subscription that no longer entitles the shop to plan features (records stay readable). */
export function isLapsed(subscription, now = new Date()) {
  if (!subscription) return false;
  if (['CANCELLED', 'EXPIRED'].includes(subscription.status)) return true;
  if (subscription.status === 'TRIAL' && subscription.trialEndsAt && subscription.trialEndsAt < now) return true;
  if (subscription.endsAt && subscription.endsAt < now) return true;
  return false;
}

/**
 * What a shop is entitled to right now: plan (its own, or the platform default), status, feature
 * set after overrides, and limits. Used by the shop-side `requireFeature` and limit checks, and by
 * the console's shop pages. Returns the same shape for every shop so callers need no special cases.
 */
export async function entitlementsFor(shopId) {
  const [subscription, settings, overrides] = await Promise.all([
    ShopSubscription.findOne({ shopId }).lean(),
    getSettings(),
    FeatureOverride.find({ shopId }).lean()
  ]);
  const planKey = subscription?.planKey ?? settings.defaultPlanKey ?? 'FREE_TRIAL';
  const plan = (await SubscriptionPlan.findOne({ key: planKey }).lean())
    ?? DEFAULT_PLANS.find(p => p.key === planKey) ?? (await SubscriptionPlan.findOne({ key: 'FREE_TRIAL' }).lean()) ?? DEFAULT_PLANS[0];
  const lapsed = isLapsed(subscription);
  const features = new Set(lapsed ? [] : (plan?.features ?? []));
  for (const o of overrides) { if (o.enabled) features.add(o.featureKey); else features.delete(o.featureKey); }
  return {
    planKey: plan?.key ?? planKey,
    planName: plan?.name ?? planKey,
    subscriptionStatus: subscription?.status ?? 'DEFAULT',
    usingDefaultPlan: !subscription,
    lapsed,
    endsAt: subscription?.endsAt ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    limits: plan?.limits ?? { maxEmployees: null, maxInventoryUnits: null, maxBranches: null },
    features: [...features].filter(k => isFeatureKey(k)),
    overrides: overrides.map(o => ({ featureKey: o.featureKey, enabled: o.enabled, reason: o.reason })),
    catalog: FEATURE_KEYS.map(key => ({ key, label: FEATURES[key].label, deployed: FEATURES[key].deployed, enabled: features.has(key) }))
  };
}
