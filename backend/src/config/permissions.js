// Role-based access control. Every route that touches inventory, sales, customers or the team
// names the permission it needs; the server enforces it (the frontends only hide buttons).
// Shop isolation is separate and absolute: every query is scoped to the shop in the login token.
//
// Three access levels:
//   owner     the shop's account; has every permission, nothing is configurable.
//   manager   an employee record with accessRole 'manager': operational defaults below, plus the
//             owner may allow or deny any permission marked `grantable` (per employee).
//   employee  an employee record with accessRole 'employee': fixed set, no overrides.
//
// `roles` lists who has the permission by default. `grantable: true` means the owner may switch
// it on or off for a manager; anything else is fixed. Team administration, permission management
// and shop settings are never grantable, so a manager can never reach them.

const P = (label, group, roles, grantable = false) => Object.freeze({ label, group, roles: Object.freeze(roles), grantable });

export const PERMISSIONS = Object.freeze({
  'dashboard.operational': P('See the shop dashboard: stock, sales totals, team activity', 'Dashboard', ['owner', 'manager']),
  'dashboard.employee': P('See their own sales summary', 'Dashboard', ['manager', 'employee']),
  'inventory.view': P('View inventory and serial numbers', 'Inventory', ['owner', 'manager', 'employee']),
  'inventory.add': P('Add stock', 'Inventory', ['owner', 'manager', 'employee']),
  'products.edit': P('Edit product catalog details', 'Inventory', ['owner', 'manager'], true),
  'inventory.edit': P('Correct unsold units (serial number, prices, supplier)', 'Inventory', ['owner'], true),
  'inventory.delete': P('Delete unsold units', 'Inventory', ['owner'], true),
  'inventory.viewCost': P('See purchase costs and stock cost values', 'Inventory', ['owner'], true),
  'sales.create': P('Record full-price and installment sales', 'Sales', ['owner', 'manager', 'employee']),
  'sales.viewAll': P('See every sale in the shop and who made it', 'Sales', ['owner', 'manager'], true),
  'sales.correct': P('Cancel or refund sales', 'Sales', ['owner'], true),
  'installments.recordPayment': P('Record installment payments', 'Installments', ['owner'], true),
  'reports.export': P('Export sales as CSV', 'Reports', ['owner'], true),
  'customers.view': P('View customers and their ID pictures', 'Customers', ['owner', 'manager', 'employee']),
  'customers.manage': P('Add and edit customers and ID pictures', 'Customers', ['owner', 'manager', 'employee']),
  'customers.delete': P('Delete customers without sales', 'Customers', ['owner'], true),
  'employees.view': P('See the team list and sales performance', 'Team', ['owner', 'manager'], true),
  'employees.manage': P('Create, edit, deactivate and remove employees', 'Team', ['owner']),
  'employees.managePermissions': P('Promote or demote managers and set their permissions', 'Team', ['owner']),
  'shop.settings': P('Change shop settings (time zone, receipt details)', 'Shop', ['owner'])
});

export const ACCESS_ROLES = Object.freeze(['employee', 'manager']);
export const ALL_PERMISSIONS = Object.freeze(Object.keys(PERMISSIONS));

/** The permissions a role has before any overrides. */
export const permissionsFor = (role) => ALL_PERMISSIONS.filter(p => PERMISSIONS[p].roles.includes(role));

/** Permissions the owner may allow or deny for a manager. */
export const grantablePermissions = () => ALL_PERMISSIONS.filter(p => PERMISSIONS[p].grantable);

/**
 * What an employee record may do: role defaults, plus (managers only) the owner's explicit
 * allows minus explicit denies. Only grantable permissions are honoured in overrides, so a
 * stale or hand-edited override can never unlock an owner-only capability.
 */
export function effectivePermissions(employee) {
  const role = ACCESS_ROLES.includes(employee?.accessRole) ? employee.accessRole : 'employee';
  const set = new Set(permissionsFor(role));
  if (role === 'manager') {
    const overrides = employee?.permissionOverrides ?? {};
    for (const p of overrides.allow ?? []) if (PERMISSIONS[p]?.grantable) set.add(p);
    for (const p of overrides.deny ?? []) if (PERMISSIONS[p]?.grantable) set.delete(p);
  }
  return [...set];
}

/**
 * Checks a request's actor (set by middleware/auth.js). Owners have every permission; employees
 * and managers carry their effective permissions, resolved from the database on each request,
 * so a demotion or revoked permission takes effect on the very next call.
 */
export const can = (actor, permission) => {
  if (!PERMISSIONS[permission] || !actor) return false;
  // The owner has every shop permission (the staff-only "own summary" dashboard is the one exception).
  if (actor.type === 'owner') return PERMISSIONS[permission].roles.includes('owner');
  return Array.isArray(actor.permissions) && actor.permissions.includes(permission);
};

/**
 * Validates manager overrides from the owner's UI. Returns { allow, deny } with duplicates removed,
 * or throws an Error whose message names the problem. Unknown keys and non-grantable keys are rejected.
 */
export function validateOverrides(input = {}) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Permission overrides must be an object with allow and deny lists');
  const lists = {};
  for (const key of ['allow', 'deny']) {
    const value = input[key] ?? [];
    if (!Array.isArray(value) || value.some(p => typeof p !== 'string')) throw new Error(`Permission ${key} list must be a list of permission names`);
    for (const p of value) {
      if (!PERMISSIONS[p]) throw new Error(`Unknown permission: ${p}`);
      if (!PERMISSIONS[p].grantable) throw new Error(`Permission ${p} can’t be changed for managers`);
    }
    lists[key] = [...new Set(value)];
  }
  const both = lists.allow.filter(p => lists.deny.includes(p));
  if (both.length) throw new Error(`A permission can’t be both allowed and denied: ${both.join(', ')}`);
  return lists;
}

/** The registry for the owner's permission editor: every permission with its label, group, defaults and whether it's configurable. */
export const permissionRegistry = () => ALL_PERMISSIONS.map(key => ({ key, ...PERMISSIONS[key], roles: [...PERMISSIONS[key].roles] }));
