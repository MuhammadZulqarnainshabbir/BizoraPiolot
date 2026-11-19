import mongoose from 'mongoose';
import { FEATURES, FEATURE_KEYS, SHOP_STATUSES, SUBSCRIPTION_STATUSES } from '../config/features.js';
import { PLATFORM_ROLES, platformPermissionRegistry } from '../config/platformPermissions.js';
import PlatformAdmin from '../models/PlatformAdmin.js';
import PlatformAuditLog from '../models/PlatformAuditLog.js';
import PlatformSetting from '../models/PlatformSetting.js';
import Shop from '../models/Shop.js';
import ShopSubscription from '../models/ShopSubscription.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import * as analytics from '../services/platform/analyticsService.js';
import { platformAudit } from '../services/platform/platformAudit.js';
import * as auth from '../services/platform/platformAuthService.js';
import * as shops from '../services/platform/shopAdminService.js';
import * as subs from '../services/platform/subscriptionService.js';
import { ApiError, handle } from '../utils/http.js';
import { shopView } from '../services/platform/shopAdminService.js';

// /api/v1/platform-admin — every handler sits behind authenticatePlatformAdmin + requirePlatformPermission.

const PAGE_MAX = 100;
const paging = (q) => ({ page: Math.max(1, Number.parseInt(q.page, 10) || 1), limit: Math.min(PAGE_MAX, Math.max(1, Number.parseInt(q.limit, 10) || 20)) });
const validId = (id) => { if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Not found'); return id; };

// ---- dashboard, analytics, health
export const dashboard = handle(async (_req, res) => res.json(await analytics.dashboard()));
export const analyticsReport = handle(async (req, res) => res.json(await analytics.analytics(req.query)));
export const health = handle(async (_req, res) => {
  let database = 'down';
  try { await mongoose.connection.db.admin().ping(); database = 'ok'; } catch { /* reported as down */ }
  const mem = process.memoryUsage();
  res.json({ status: database === 'ok' ? 'ok' : 'degraded', database, node: process.version, uptimeSeconds: Math.round(process.uptime()), memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) }, mongooseState: mongoose.connection.readyState, now: new Date().toISOString() });
});

// ---- shops
export const listShops = handle(async (req, res) => res.json(await shops.listShops(req.query)));
export const getShop = handle(async (req, res) => res.json(await shops.getShop(req.params.id)));
export const shopDiagnostics = handle(async (req, res) => res.json(await shops.diagnostics(req.params.id)));
const transition = (name) => handle(async (req, res) => {
  const result = await shops.changeShopStatus(req.params.id, name, { reason: req.body?.reason, admin: req.platformAdmin });
  await platformAudit(req, { action: result.action, targetType: 'Shop', targetId: result.shop._id, targetLabel: result.shop.shopName, reason: result.reason, before: result.before, after: result.after });
  res.json({ shop: shopView(result.shop) });
});
export const approveShop = transition('approve');
export const suspendShop = transition('suspend');
export const reactivateShop = transition('reactivate');
export const deactivateShop = transition('deactivate');

// ---- administrators
const adminView = (a) => auth.publicAdmin(a);
export const listAdmins = handle(async (req, res) => {
  const { page, limit } = paging(req.query);
  const filter = {};
  if (req.query.role) { if (!PLATFORM_ROLES.includes(req.query.role)) throw new ApiError(400, 'Unknown role'); filter.role = req.query.role; }
  const [items, total] = await Promise.all([PlatformAdmin.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), PlatformAdmin.countDocuments(filter)]);
  res.json({ items: items.map(adminView), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), roles: PLATFORM_ROLES, permissions: platformPermissionRegistry() });
});
export const createAdmin = handle(async (req, res) => {
  const { email, name, role } = req.body || {};
  // A random temporary password, shown once in the response; the new admin must change it before doing anything else.
  const password = auth.temporaryPassword();
  const admin = await auth.createPlatformAdmin({ email, name, role, password, createdBy: req.platformAdmin._id });
  await platformAudit(req, { action: 'PLATFORM_ADMIN_CREATED', targetType: 'PlatformAdmin', targetId: admin._id, targetLabel: admin.email, after: { role: admin.role } });
  res.status(201).json({ admin: adminView(admin), temporaryPassword: password });
});
export const updateAdmin = handle(async (req, res) => {
  const id = validId(req.params.id);
  const before = await PlatformAdmin.findById(id);
  if (!before) throw new ApiError(404, 'Administrator not found');
  const changes = {};
  const { name, role, status, reason } = req.body || {};
  if (name !== undefined) { if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new ApiError(400, 'Name is required (up to 120 characters)'); changes.name = name.trim(); }
  if (role !== undefined) { if (!PLATFORM_ROLES.includes(role)) throw new ApiError(400, 'Unknown role'); changes.role = role; }
  if (status !== undefined) { if (!['active', 'inactive'].includes(status)) throw new ApiError(400, 'Status must be active or inactive'); changes.status = status; }
  if (!Object.keys(changes).length) throw new ApiError(400, 'Nothing to change');
  const self = String(before._id) === String(req.platformAdmin._id);
  if (self && (changes.role && changes.role !== 'SUPER_ADMIN' || changes.status === 'inactive')) throw new ApiError(409, 'You can’t remove your own super-admin access');
  if ((changes.role && changes.role !== 'SUPER_ADMIN' && before.role === 'SUPER_ADMIN') || (changes.status === 'inactive' && before.role === 'SUPER_ADMIN')) {
    const others = await PlatformAdmin.countDocuments({ _id: { $ne: before._id }, role: 'SUPER_ADMIN', status: 'active' });
    if (!others) throw new ApiError(409, 'At least one active super admin must remain');
  }
  const revoke = changes.status === 'inactive' || (changes.role && changes.role !== before.role);
  const after = await PlatformAdmin.findOneAndUpdate({ _id: id }, { $set: changes, ...(revoke ? { $inc: { tokenVersion: 1 } } : {}) }, { new: true });
  await platformAudit(req, { action: 'PLATFORM_ADMIN_UPDATED', targetType: 'PlatformAdmin', targetId: id, targetLabel: after.email, reason: String(reason ?? '').slice(0, 500), before: { name: before.name, role: before.role, status: before.status }, after: { name: after.name, role: after.role, status: after.status } });
  res.json({ admin: adminView(after) });
});
export const revokeAdminSessions = handle(async (req, res) => {
  const id = validId(req.params.id);
  const admin = await PlatformAdmin.findById(id);
  if (!admin) throw new ApiError(404, 'Administrator not found');
  await auth.revokeSessions(id);
  await platformAudit(req, { action: 'PLATFORM_ADMIN_SESSIONS_REVOKED', targetType: 'PlatformAdmin', targetId: id, targetLabel: admin.email, reason: String(req.body?.reason ?? '').slice(0, 500) });
  res.status(204).end();
});
export const resetAdminPassword = handle(async (req, res) => {
  const id = validId(req.params.id);
  const admin = await PlatformAdmin.findById(id);
  if (!admin) throw new ApiError(404, 'Administrator not found');
  const password = auth.temporaryPassword();
  const bcrypt = (await import('bcryptjs')).default;
  await PlatformAdmin.updateOne({ _id: id }, { $set: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, failedLogins: 0 }, $inc: { tokenVersion: 1 }, $unset: { lockedUntil: 1 } });
  await platformAudit(req, { action: 'PLATFORM_ADMIN_PASSWORD_RESET', targetType: 'PlatformAdmin', targetId: id, targetLabel: admin.email, reason: String(req.body?.reason ?? '').slice(0, 500) });
  res.json({ temporaryPassword: password });
});

// ---- plans and subscriptions
export const listPlans = handle(async (_req, res) => res.json({ plans: await subs.listPlans(), features: FEATURE_KEYS.map(key => ({ key, ...FEATURES[key] })), statuses: SUBSCRIPTION_STATUSES }));
export const createPlan = handle(async (req, res) => {
  const plan = await subs.createPlan(req.body);
  await platformAudit(req, { action: 'PLAN_CREATED', targetType: 'SubscriptionPlan', targetId: plan.key, targetLabel: plan.name, after: plan.toObject() });
  res.status(201).json({ plan });
});
export const updatePlan = handle(async (req, res) => {
  const before = await SubscriptionPlan.findOne({ key: String(req.params.key).toUpperCase() }).lean();
  const plan = await subs.updatePlan(req.params.key, req.body);
  await platformAudit(req, { action: 'PLAN_UPDATED', targetType: 'SubscriptionPlan', targetId: plan.key, targetLabel: plan.name, reason: String(req.body?.reason ?? '').slice(0, 500), before, after: plan.toObject() });
  res.json({ plan });
});
export const listSubscriptions = handle(async (req, res) => {
  const { page, limit } = paging(req.query);
  const filter = {};
  if (req.query.planKey) filter.planKey = String(req.query.planKey).toUpperCase();
  if (req.query.status) { if (!SUBSCRIPTION_STATUSES.includes(req.query.status)) throw new ApiError(400, 'Unknown status'); filter.status = req.query.status; }
  const [items, total] = await Promise.all([ShopSubscription.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ShopSubscription.countDocuments(filter)]);
  const shopsById = Object.fromEntries((await Shop.find({ _id: { $in: items.map(s => s.shopId) } }).select('shopName shopCode status').lean()).map(s => [String(s._id), s]));
  res.json({ items: items.map(s => ({ ...s, shop: shopsById[String(s.shopId)] ? { shopName: shopsById[String(s.shopId)].shopName, shopCode: shopsById[String(s.shopId)].shopCode, status: shopsById[String(s.shopId)].status } : null })), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});
export const setSubscription = handle(async (req, res) => {
  const shop = await Shop.findById(validId(req.params.id)).select('shopName').lean();
  if (!shop) throw new ApiError(404, 'Shop not found');
  const before = await ShopSubscription.findOne({ shopId: shop._id }).lean();
  const subscription = await subs.setShopSubscription(shop._id, req.body, req.platformAdmin._id);
  await platformAudit(req, { action: 'SUBSCRIPTION_SET', targetType: 'Shop', targetId: shop._id, targetLabel: shop.shopName, reason: String(req.body?.reason ?? '').slice(0, 500), before: before ? { planKey: before.planKey, status: before.status, endsAt: before.endsAt } : null, after: { planKey: subscription.planKey, status: subscription.status, endsAt: subscription.endsAt } });
  res.json({ subscription, entitlements: await subs.entitlementsFor(shop._id) });
});

// ---- features
export const featureCatalog = handle(async (_req, res) => res.json({ features: FEATURE_KEYS.map(key => ({ key, ...FEATURES[key] })), plans: await subs.listPlans() }));
export const shopFeatures = handle(async (req, res) => res.json({ entitlements: await subs.entitlementsFor(validId(req.params.id)) }));
export const setShopFeature = handle(async (req, res) => {
  const shop = await Shop.findById(validId(req.params.id)).select('shopName').lean();
  if (!shop) throw new ApiError(404, 'Shop not found');
  const override = await subs.setFeatureOverride(shop._id, req.params.key, { enabled: req.body?.enabled, reason: req.body?.reason }, req.platformAdmin._id);
  await platformAudit(req, { action: 'FEATURE_OVERRIDE_SET', targetType: 'Shop', targetId: shop._id, targetLabel: shop.shopName, reason: override.reason, after: { featureKey: override.featureKey, enabled: override.enabled } });
  res.json({ override, entitlements: await subs.entitlementsFor(shop._id) });
});
export const clearShopFeature = handle(async (req, res) => {
  const shop = await Shop.findById(validId(req.params.id)).select('shopName').lean();
  if (!shop) throw new ApiError(404, 'Shop not found');
  const removed = await subs.removeFeatureOverride(shop._id, req.params.key);
  if (!removed) throw new ApiError(404, 'No override for this feature');
  await platformAudit(req, { action: 'FEATURE_OVERRIDE_CLEARED', targetType: 'Shop', targetId: shop._id, targetLabel: shop.shopName, before: { featureKey: removed.featureKey, enabled: removed.enabled } });
  res.json({ entitlements: await subs.entitlementsFor(shop._id) });
});

// ---- audit log
export const auditLogs = handle(async (req, res) => {
  const { page, limit } = paging(req.query);
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action).toUpperCase().slice(0, 60);
  if (req.query.adminId && mongoose.isValidObjectId(req.query.adminId)) filter.adminId = req.query.adminId;
  if (req.query.targetId) filter.targetId = String(req.query.targetId).slice(0, 60);
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) { const d = new Date(req.query.to); d.setDate(d.getDate() + 1); filter.createdAt.$lt = d; }
  }
  const [items, total, actions] = await Promise.all([
    PlatformAuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PlatformAuditLog.countDocuments(filter),
    PlatformAuditLog.distinct('action')
  ]);
  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), actions: actions.sort() });
});

// ---- settings
export const getSettings = handle(async (_req, res) => res.json({ settings: await subs.getSettings(), shopStatuses: SHOP_STATUSES }));
export const updateSettings = handle(async (req, res) => {
  const changes = {};
  const { registrationApproval, defaultPlanKey, suspensionMessage, supportEmail } = req.body || {};
  if (registrationApproval !== undefined) { if (!['automatic', 'manual'].includes(registrationApproval)) throw new ApiError(400, 'Registration approval must be automatic or manual'); changes.registrationApproval = registrationApproval; }
  if (defaultPlanKey !== undefined) { const key = String(defaultPlanKey).toUpperCase(); if (!(await SubscriptionPlan.exists({ key }))) throw new ApiError(400, 'Choose an existing plan'); changes.defaultPlanKey = key; }
  if (suspensionMessage !== undefined) { if (typeof suspensionMessage !== 'string' || suspensionMessage.trim().length > 300 || !suspensionMessage.trim()) throw new ApiError(400, 'Suspension message must be 1–300 characters'); changes.suspensionMessage = suspensionMessage.trim(); }
  if (supportEmail !== undefined) { if (typeof supportEmail !== 'string' || supportEmail.length > 254) throw new ApiError(400, 'Support email is too long'); changes.supportEmail = supportEmail.trim(); }
  if (!Object.keys(changes).length) throw new ApiError(400, 'Nothing to change');
  const before = await subs.getSettings();
  const settings = await PlatformSetting.findOneAndUpdate({ key: 'default' }, { $set: changes }, { new: true, upsert: true, lean: true });
  await platformAudit(req, { action: 'PLATFORM_SETTINGS_UPDATED', targetType: 'PlatformSetting', targetId: 'default', before: Object.fromEntries(Object.keys(changes).map(k => [k, before[k]])), after: changes });
  res.json({ settings });
});
