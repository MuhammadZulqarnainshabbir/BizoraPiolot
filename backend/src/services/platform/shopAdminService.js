import mongoose from 'mongoose';
import { SHOP_STATUSES } from '../../config/features.js';
import AuditLog from '../../models/AuditLog.js';
import Customer from '../../models/Customer.js';
import Employee from '../../models/Employee.js';
import InstallmentAgreement from '../../models/InstallmentAgreement.js';
import InventoryUnit from '../../models/InventoryUnit.js';
import PlatformAuditLog from '../../models/PlatformAuditLog.js';
import Product from '../../models/Product.js';
import SaleRecord from '../../models/SaleRecord.js';
import Shop from '../../models/Shop.js';
import ShopSubscription from '../../models/ShopSubscription.js';
import { ApiError } from '../../utils/http.js';
import { shopSlug } from '../../utils/validation.js';
import { entitlementsFor } from './subscriptionService.js';

// Shop administration for the platform console. Deliberately narrow: counts and status, never
// customer records, CNIC pictures, cost prices or individual sales.

const PAGE_MAX = 100;
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The shop as the console sees it (no password hash, counters or receipt terms). */
export function shopView(shop, subscription) {
  return {
    _id: shop._id, shopName: shop.shopName, slug: shopSlug(shop.shopName), shopCode: shop.shopCode ?? null,
    ownerName: shop.ownerName, email: shop.email, phone: shop.phone, address: shop.address, timezone: shop.timezone || 'Asia/Karachi',
    ntn: shop.ntn ?? '', strn: shop.strn ?? '',
    status: shop.status ?? 'ACTIVE', statusReason: shop.statusReason ?? '', statusChangedAt: shop.statusChangedAt ?? null, statusChangedBy: shop.statusChangedBy ?? '',
    lastActivityAt: shop.lastActivityAt ?? null, createdAt: shop.createdAt, updatedAt: shop.updatedAt,
    subscription: subscription ? { planKey: subscription.planKey, status: subscription.status, endsAt: subscription.endsAt, trialEndsAt: subscription.trialEndsAt } : null
  };
}

export async function listShops(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const filter = {};
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  if (search) filter.$or = [{ shopName: { $regex: escapeRegex(search), $options: 'i' } }, { shopCode: search.toUpperCase().replace(/[\s-]+/g, '') }, { email: { $regex: escapeRegex(search), $options: 'i' } }];
  if (query.status) { if (!SHOP_STATUSES.includes(query.status)) throw new ApiError(400, 'Unknown status'); filter.status = query.status; }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) { const d = new Date(query.from); if (Number.isNaN(d.getTime())) throw new ApiError(400, '“From” must be a date'); filter.createdAt.$gte = d; }
    if (query.to) { const d = new Date(query.to); if (Number.isNaN(d.getTime())) throw new ApiError(400, '“To” must be a date'); d.setDate(d.getDate() + 1); filter.createdAt.$lt = d; }
  }
  if (query.planKey) {
    const ids = await ShopSubscription.find({ planKey: String(query.planKey).toUpperCase() }).distinct('shopId');
    filter._id = { $in: ids };
  }
  const sortField = ['createdAt', 'shopName', 'status', 'lastActivityAt'].includes(query.sort) ? query.sort : 'createdAt';
  const sort = { [sortField]: query.order === 'asc' ? 1 : -1, _id: -1 };
  const [records, total] = await Promise.all([
    Shop.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Shop.countDocuments(filter)
  ]);
  const subscriptions = await ShopSubscription.find({ shopId: { $in: records.map(s => s._id) } }).lean();
  const byShop = Object.fromEntries(subscriptions.map(s => [String(s.shopId), s]));
  return { items: records.map(s => shopView(s, byShop[String(s._id)])), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getShop(idRaw) {
  if (!mongoose.isValidObjectId(idRaw)) throw new ApiError(404, 'Shop not found');
  const shop = await Shop.findById(idRaw).lean();
  if (!shop) throw new ApiError(404, 'Shop not found');
  const sid = shop._id;
  const [subscription, employees, managers, units, products, sales, agreements, customers, entitlements, platformHistory] = await Promise.all([
    ShopSubscription.findOne({ shopId: sid }).lean(),
    Employee.countDocuments({ shopId: sid }),
    Employee.countDocuments({ shopId: sid, accessRole: 'manager' }),
    InventoryUnit.countDocuments({ shopId: sid }),
    Product.countDocuments({ shopId: sid }),
    SaleRecord.countDocuments({ shopId: sid, status: 'COMPLETED' }),
    InstallmentAgreement.countDocuments({ shopId: sid, status: 'ACTIVE' }),
    Customer.countDocuments({ shopId: sid }),
    entitlementsFor(sid),
    PlatformAuditLog.find({ targetType: 'Shop', targetId: String(sid) }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  return {
    shop: shopView(shop, subscription),
    counts: { employees, managers, units, products, completedSales: sales, activeAgreements: agreements, customers },
    subscription,
    entitlements,
    platformHistory
  };
}

/**
 * Status transitions, concurrency-safe: the update only applies if the shop is still in the
 * status the admin saw, so two admins acting at once get one success and one 409.
 */
const TRANSITIONS = {
  approve: { from: ['PENDING'], to: 'ACTIVE', action: 'SHOP_APPROVED' },
  suspend: { from: ['ACTIVE', 'PENDING'], to: 'SUSPENDED', action: 'SHOP_SUSPENDED' },
  reactivate: { from: ['SUSPENDED', 'DEACTIVATED'], to: 'ACTIVE', action: 'SHOP_REACTIVATED' },
  deactivate: { from: ['ACTIVE', 'SUSPENDED', 'PENDING'], to: 'DEACTIVATED', action: 'SHOP_DEACTIVATED' }
};

export async function changeShopStatus(idRaw, transition, { reason, admin }) {
  const rule = TRANSITIONS[transition];
  if (!rule) throw new ApiError(400, 'Unknown transition');
  if (!mongoose.isValidObjectId(idRaw)) throw new ApiError(404, 'Shop not found');
  const text = String(reason ?? '').trim();
  if (!text) throw new ApiError(400, 'A reason is required');
  if (text.length > 500) throw new ApiError(400, 'Reason must be at most 500 characters');
  const before = await Shop.findById(idRaw).select('status shopName').lean();
  if (!before) throw new ApiError(404, 'Shop not found');
  const current = before.status ?? 'ACTIVE';
  if (!rule.from.includes(current)) throw new ApiError(409, `A ${current.toLowerCase()} shop can’t be ${transition}d`, 'INVALID_TRANSITION');
  const after = await Shop.findOneAndUpdate(
    { _id: before._id, $or: [{ status: current }, ...(current === 'ACTIVE' ? [{ status: { $exists: false } }] : [])] },
    { $set: { status: rule.to, statusReason: text, statusChangedAt: new Date(), statusChangedBy: admin.email } },
    { new: true, lean: true }
  );
  if (!after) throw new ApiError(409, 'The shop’s status changed while you were working. Reload and try again.', 'CONFLICT');
  return { shop: after, action: rule.action, before: { status: current }, after: { status: rule.to }, reason: text };
}

/** Support view: nothing sensitive, enough to answer "why can’t this shop do X". */
export async function diagnostics(idRaw) {
  const details = await getShop(idRaw);
  const sid = details.shop._id;
  const [recentShopAudit, lastSale, lastUnit, staffStatus] = await Promise.all([
    AuditLog.find({ shopId: sid }).sort({ createdAt: -1 }).limit(10).select('action entityType createdAt actor.type').lean(),
    SaleRecord.findOne({ shopId: sid }).sort({ soldAt: -1 }).select('soldAt').lean(),
    InventoryUnit.findOne({ shopId: sid }).sort({ createdAt: -1 }).select('createdAt').lean(),
    Employee.aggregate([{ $match: { shopId: sid } }, { $group: { _id: '$status', n: { $sum: 1 } } }])
  ]);
  const e = details.entitlements;
  const restrictions = [];
  if (details.shop.status !== 'ACTIVE') restrictions.push({ kind: 'status', message: `Shop is ${details.shop.status}: nobody can sign in or use the APIs.` });
  if (e.lapsed) restrictions.push({ kind: 'subscription', message: 'Subscription has lapsed: plan features are unavailable, records stay readable.' });
  for (const f of e.catalog.filter(c => c.deployed && !c.enabled)) restrictions.push({ kind: 'feature', message: `${f.label} is not available on the ${e.planName} plan.`, featureKey: f.key });
  const limits = e.limits;
  if (limits.maxEmployees !== null && details.counts.employees >= limits.maxEmployees) restrictions.push({ kind: 'limit', message: `Employee limit reached (${details.counts.employees}/${limits.maxEmployees}).` });
  if (limits.maxInventoryUnits !== null && details.counts.units >= limits.maxInventoryUnits) restrictions.push({ kind: 'limit', message: `Inventory capacity reached (${details.counts.units}/${limits.maxInventoryUnits}).` });
  return {
    ...details,
    restrictions,
    activity: { lastSaleAt: lastSale?.soldAt ?? null, lastStockAddedAt: lastUnit?.createdAt ?? null, lastActivityAt: details.shop.lastActivityAt },
    staff: Object.fromEntries(staffStatus.map(s => [s._id, s.n])),
    recentShopAudit: recentShopAudit.map(a => ({ action: a.action, entityType: a.entityType, by: a.actor?.type ?? '', at: a.createdAt }))
  };
}
