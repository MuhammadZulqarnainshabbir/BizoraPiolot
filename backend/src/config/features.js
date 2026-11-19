// Feature entitlements. A feature is something a shop's plan may or may not include; whether a
// particular user may use it is still decided by their shop permission (config/permissions.js).
// Both checks must pass. `deployed: false` marks features that exist only as entitlements for
// now (nothing in the app is gated by them yet).

export const FEATURES = Object.freeze({
  installments: { label: 'Installment sales', description: 'Sell on installment, schedules, payments', deployed: true },
  receipts_pdf: { label: 'PDF receipts', description: 'Receipts and agreements as PDF', deployed: true },
  csv_export: { label: 'CSV export', description: 'Export sales to CSV', deployed: true },
  customer_documents: { label: 'Customer ID pictures', description: 'Store CNIC pictures on customer records', deployed: true },
  manager_role: { label: 'Manager role', description: 'Promote employees to managers with configurable permissions', deployed: true },
  purchase_orders: { label: 'Purchase orders', description: 'Planned', deployed: false },
  supplier_management: { label: 'Supplier management', description: 'Planned', deployed: false },
  goods_receiving: { label: 'Goods receiving', description: 'Planned', deployed: false },
  advanced_reports: { label: 'Advanced reports', description: 'Planned', deployed: false },
  multi_branch: { label: 'Multi-branch management', description: 'Planned', deployed: false },
  barcode_scanning: { label: 'Barcode scanning', description: 'Planned', deployed: false },
  advanced_installments: { label: 'Advanced installment management', description: 'Planned', deployed: false }
});

export const FEATURE_KEYS = Object.freeze(Object.keys(FEATURES));
export const DEPLOYED_FEATURES = Object.freeze(FEATURE_KEYS.filter(k => FEATURES[k].deployed));
export const isFeatureKey = (key) => Object.prototype.hasOwnProperty.call(FEATURES, key);

/**
 * Plans seeded on first start. Names, prices and limits are editable afterwards (platform
 * console → Plans); they are starting points, not commercial commitments. Prices are 0 until
 * the business sets them, so the dashboard never shows invented revenue. `null` = unlimited.
 */
export const DEFAULT_PLANS = Object.freeze([
  { key: 'FREE_TRIAL', name: 'Free trial', description: '30-day trial with every deployed feature', priceCents: 0, billingPeriod: 'MONTH', trialDays: 30, sortOrder: 1,
    limits: { maxEmployees: 10, maxInventoryUnits: 1000, maxBranches: 1 }, features: [...DEPLOYED_FEATURES] },
  { key: 'BASIC', name: 'Basic', description: 'Inventory, sales and customers for a single counter', priceCents: 0, billingPeriod: 'MONTH', trialDays: 0, sortOrder: 2,
    limits: { maxEmployees: 5, maxInventoryUnits: 2000, maxBranches: 1 }, features: ['installments', 'receipts_pdf', 'customer_documents'] },
  { key: 'PROFESSIONAL', name: 'Professional', description: 'Every deployed feature, larger team', priceCents: 0, billingPeriod: 'MONTH', trialDays: 0, sortOrder: 3,
    limits: { maxEmployees: 15, maxInventoryUnits: 20000, maxBranches: 1 }, features: [...DEPLOYED_FEATURES] },
  { key: 'ENTERPRISE', name: 'Enterprise', description: 'No limits; future features as they ship', priceCents: 0, billingPeriod: 'MONTH', trialDays: 0, sortOrder: 4,
    limits: { maxEmployees: null, maxInventoryUnits: null, maxBranches: null }, features: [...FEATURE_KEYS] }
]);

export const SHOP_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
export const SUBSCRIPTION_STATUSES = Object.freeze(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']);
