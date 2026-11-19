// Platform (Bizora staff) authorization. A separate domain from shop roles: platform admins are
// not shop employees, carry a different token audience, and never pass the shop middleware.
// Deny by default: a permission not listed for a role is refused.

export const PLATFORM_ROLES = Object.freeze(['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']);

const P = (label, roles) => Object.freeze({ label, roles: Object.freeze(roles) });

export const PLATFORM_PERMISSIONS = Object.freeze({
  'dashboard.view': P('See the platform dashboard', ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']),
  'shops.view': P('Search shops and see non-sensitive shop details', ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']),
  'shops.manage': P('Approve, suspend, reactivate and deactivate shops', ['SUPER_ADMIN']),
  'shops.diagnostics': P('See a shop’s diagnostics and support view', ['SUPER_ADMIN', 'SUPPORT_ADMIN']),
  'admins.view': P('See platform administrators', ['SUPER_ADMIN']),
  'admins.manage': P('Create, change and deactivate platform administrators', ['SUPER_ADMIN']),
  'plans.view': P('See subscription plans', ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']),
  'plans.manage': P('Create and change subscription plans', ['SUPER_ADMIN']),
  'subscriptions.view': P('See shop subscriptions and billing status', ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']),
  'subscriptions.manage': P('Assign plans and change subscription status', ['SUPER_ADMIN', 'FINANCE_ADMIN']),
  'billing.view': P('See platform billing summaries (Bizora fees, not shop sales)', ['SUPER_ADMIN', 'FINANCE_ADMIN']),
  'features.view': P('See feature availability', ['SUPER_ADMIN', 'SUPPORT_ADMIN']),
  'features.manage': P('Change feature availability for a shop', ['SUPER_ADMIN']),
  'analytics.view': P('See aggregated platform analytics', ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']),
  'health.view': P('See API health', ['SUPER_ADMIN', 'SUPPORT_ADMIN']),
  'audit.view': P('See the platform audit log', ['SUPER_ADMIN']),
  'settings.view': P('See platform settings', ['SUPER_ADMIN']),
  'settings.manage': P('Change platform settings', ['SUPER_ADMIN'])
});

export const platformPermissionsFor = (role) => Object.keys(PLATFORM_PERMISSIONS).filter(p => PLATFORM_PERMISSIONS[p].roles.includes(role));

export const platformCan = (admin, permission) => Boolean(admin && PLATFORM_PERMISSIONS[permission]?.roles.includes(admin.role));

export const platformPermissionRegistry = () => Object.entries(PLATFORM_PERMISSIONS).map(([key, p]) => ({ key, label: p.label, roles: [...p.roles] }));
