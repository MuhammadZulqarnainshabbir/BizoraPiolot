import { DEPLOYED_FEATURES, FEATURES } from '../../config/features.js';
import Customer from '../../models/Customer.js';
import Employee from '../../models/Employee.js';
import InstallmentAgreement from '../../models/InstallmentAgreement.js';
import InventoryUnit from '../../models/InventoryUnit.js';
import PlatformAuditLog from '../../models/PlatformAuditLog.js';
import Product from '../../models/Product.js';
import SaleRecord from '../../models/SaleRecord.js';
import Shop from '../../models/Shop.js';
import ShopSubscription from '../../models/ShopSubscription.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';
import { metricsSnapshot } from '../../middleware/requestMetrics.js';
import { shopView } from './shopAdminService.js';
import { getSettings } from './subscriptionService.js';

// Aggregated, platform-wide figures only. Counts and trends, never individual customer records
// or a shop's transactions. Everything here is an indexed count or a small aggregation.

const statusCounts = async () => {
  const rows = await Shop.aggregate([{ $group: { _id: { $ifNull: ['$status', 'ACTIVE'] }, n: { $sum: 1 } } }]);
  const out = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0, DEACTIVATED: 0 };
  for (const r of rows) out[r._id] = r.n;
  return out;
};

const subscriptionCounts = async () => {
  const [byStatus, byPlan, plans, shops] = await Promise.all([
    ShopSubscription.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ShopSubscription.aggregate([{ $group: { _id: '$planKey', n: { $sum: 1 } } }]),
    SubscriptionPlan.find().lean(),
    Shop.estimatedDocumentCount()
  ]);
  const withSubscription = byPlan.reduce((s, r) => s + r.n, 0);
  const priceByPlan = Object.fromEntries(plans.map(p => [p.key, { priceCents: p.priceCents, billingPeriod: p.billingPeriod }]));
  // Monthly recurring revenue = Bizora's own fees from active/trial-converted subscriptions. Shop sales never count.
  const activeByPlan = await ShopSubscription.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: '$planKey', n: { $sum: 1 } } }]);
  const mrrCents = activeByPlan.reduce((sum, r) => { const p = priceByPlan[r._id]; if (!p) return sum; return sum + r.n * (p.billingPeriod === 'YEAR' ? Math.round(p.priceCents / 12) : p.priceCents); }, 0);
  return {
    byStatus: Object.fromEntries(byStatus.map(r => [r._id, r.n])),
    byPlan: Object.fromEntries(byPlan.map(r => [r._id, r.n])),
    onDefaultPlan: Math.max(0, shops - withSubscription),
    mrrCents,
    pricesConfigured: plans.some(p => p.priceCents > 0)
  };
};

export async function dashboard() {
  const [shops, subscriptions, employeesActive, managers, recentShops, recentActivity, settings] = await Promise.all([
    statusCounts(),
    subscriptionCounts(),
    Employee.countDocuments({ status: 'active' }),
    Employee.countDocuments({ accessRole: 'manager' }),
    Shop.find().sort({ createdAt: -1 }).limit(5).lean(),
    PlatformAuditLog.find({ action: { $nin: ['PLATFORM_LOGIN', 'PLATFORM_LOGIN_FAILED', 'PLATFORM_LOGOUT'] } }).sort({ createdAt: -1 }).limit(10).lean(),
    getSettings()
  ]);
  const totalShops = Object.values(shops).reduce((a, b) => a + b, 0);
  return {
    shops: { total: totalShops, ...shops },
    users: { owners: totalShops, activeEmployees: employeesActive, managers },
    subscriptions,
    recentShops: recentShops.map(s => shopView(s)),
    recentActivity,
    api: metricsSnapshot(),
    settings: { registrationApproval: settings.registrationApproval, defaultPlanKey: settings.defaultPlanKey }
  };
}

const monthly = (Model, field, match = {}) => Model.aggregate([
  { $match: match },
  { $group: { _id: { $dateToString: { format: '%Y-%m', date: `$${field}` } }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, month: '$_id', count: '$n' } }
]);

function range(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) { const e = new Error('Dates must be valid'); e.status = 400; throw e; }
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export async function analytics(query = {}) {
  const { from, to } = range(query);
  const window = { $gte: from, $lt: to };
  const [registrations, salesByMonth, unitsByMonth, shops, subscriptions, employees, managers, products, units, sales, agreements, customers, plans, overridesCount] = await Promise.all([
    monthly(Shop, 'createdAt', { createdAt: window }),
    monthly(SaleRecord, 'soldAt', { soldAt: window, status: 'COMPLETED' }),
    monthly(InventoryUnit, 'createdAt', { createdAt: window }),
    statusCounts(),
    subscriptionCounts(),
    Employee.estimatedDocumentCount(),
    Employee.countDocuments({ accessRole: 'manager' }),
    Product.estimatedDocumentCount(),
    InventoryUnit.estimatedDocumentCount(),
    SaleRecord.estimatedDocumentCount(),
    InstallmentAgreement.countDocuments({ status: 'ACTIVE' }),
    Customer.estimatedDocumentCount(),
    SubscriptionPlan.find().lean(),
    ShopSubscription.aggregate([{ $group: { _id: '$planKey', n: { $sum: 1 } } }])
  ]);
  // Feature adoption: how many shops are entitled to each deployed feature, from plan membership (overrides excluded: small numbers, exact per-shop view is on the shop page).
  const total = Object.values(shops).reduce((a, b) => a + b, 0);
  const byPlan = Object.fromEntries(overridesCount.map(r => [r._id, r.n]));
  const settings = await getSettings();
  const defaultPlan = plans.find(p => p.key === settings.defaultPlanKey);
  const onDefault = Math.max(0, total - overridesCount.reduce((s, r) => s + r.n, 0));
  const featureAdoption = DEPLOYED_FEATURES.map(key => ({
    key, label: FEATURES[key].label,
    shops: plans.reduce((s, p) => s + (p.features.includes(key) ? (byPlan[p.key] ?? 0) : 0), 0) + (defaultPlan?.features.includes(key) ? onDefault : 0)
  }));
  return {
    range: { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() },
    registrationsByMonth: registrations,
    salesByMonth,
    unitsAddedByMonth: unitsByMonth,
    shops: { total, ...shops },
    subscriptions,
    users: { owners: total, employees, managers },
    records: { products, units, sales, activeAgreements: agreements, customers },
    featureAdoption,
    api: metricsSnapshot()
  };
}
