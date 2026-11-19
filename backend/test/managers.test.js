import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addUnits, api, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

// Manager role: an employee record with accessRole 'manager', operational defaults, owner-set
// overrides, immediate revocation (config/permissions.js, controllers/employeeController.js).

let owner, other, staff, manager, units;
const login = (employeeId, password = 'NewPass123') => api('POST', '/employee/login', { shopId: owner.shop.id, employeeId, password });

before(async () => {
  await startApi();
  owner = await newShop('Manager Shop');
  other = await newShop('Other Shop');
  staff = await newEmployee(owner, 'Sara Staff');
  manager = await newEmployee(owner, 'Maria Manager');
  units = await addUnits(owner.token, [serial(), serial(), serial(), serial(), serial(), serial()], { sellingPrice: 100000, purchasePrice: 80000 });
});
after(stopApi);

describe('promotion and login', () => {
  it('a plain employee has the employee defaults and no shop-wide access', async () => {
    const me = await api('GET', '/employee/me', undefined, manager.token);
    assert.equal(me.body.employee.accessRole, 'employee');
    assert.ok(!me.body.permissions.includes('sales.viewAll'));
    assert.ok(!me.body.permissions.includes('dashboard.operational'));
    assert.equal((await api('GET', '/employees', undefined, manager.token)).status, 403);
  });

  it('the owner promotes an employee; the same record becomes a manager and gets the operational defaults', async () => {
    const res = await api('POST', `/employees/${manager.employee._id}/promote-manager`, { reason: 'Runs the counter' }, owner.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.employee.accessRole, 'manager');
    assert.equal(res.body.employee.employeeId, manager.employee.employeeId, 'same employee ID');
    assert.deepEqual(res.body.permissions.overrides, { allow: [], deny: [] });
    for (const p of ['dashboard.operational', 'inventory.view', 'inventory.add', 'products.edit', 'sales.create', 'sales.viewAll', 'customers.view', 'customers.manage', 'employees.view']) {
      assert.ok(res.body.permissions.effective.includes(p), `has ${p}`);
    }
    for (const p of ['inventory.viewCost', 'inventory.delete', 'inventory.edit', 'sales.correct', 'installments.recordPayment', 'reports.export', 'customers.delete', 'employees.manage', 'employees.managePermissions', 'shop.settings']) {
      assert.ok(!res.body.permissions.effective.includes(p), `lacks ${p}`);
    }
    assert.equal((await api('POST', `/employees/${manager.employee._id}/promote-manager`, {}, owner.token)).status, 409, 'already a manager');
  });

  it('the promotion applies to the session that was already open, and to refresh', async () => {
    const me = await api('GET', '/employee/me', undefined, manager.token);
    assert.equal(me.body.employee.accessRole, 'manager');
    assert.ok(me.body.permissions.includes('sales.viewAll'));
    const refreshed = await api('POST', '/employee/refresh', {}, manager.token);
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.body.token);
    assert.equal(refreshed.body.employee.accessRole, 'manager');
    assert.ok(refreshed.body.permissions.includes('dashboard.operational'));
    assert.equal(refreshed.body.expiresIn, 15 * 60, 'employee session policy applies to managers');
  });

  it('a manager signs in through the normal staff login and gets the manager role in the response', async () => {
    const res = await login(manager.employee.employeeId);
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.accessRole, 'manager');
    assert.ok(res.body.permissions.includes('sales.viewAll'));
    assert.ok(!res.body.permissions.includes('inventory.viewCost'));
    manager.token = res.body.token;
  });
});

describe('what a manager may and may not do', () => {
  it('cannot administer the team, roles or permissions, including their own', async () => {
    assert.equal((await api('POST', `/employees/${staff.employee._id}/promote-manager`, {}, manager.token)).status, 403);
    assert.equal((await api('POST', `/employees/${manager.employee._id}/demote-manager`, {}, manager.token)).status, 403);
    assert.equal((await api('PATCH', `/employees/${manager.employee._id}/permissions`, { allow: ['inventory.viewCost'] }, manager.token)).status, 403);
    assert.equal((await api('GET', `/employees/${manager.employee._id}/permissions`, undefined, manager.token)).status, 403);
    assert.equal((await api('POST', '/employees', { name: 'X', email: 'x@example.com', role: 'Sales', password: 'TempPass99' }, manager.token)).status, 403);
    assert.equal((await api('PUT', `/employees/${staff.employee._id}`, { name: 'X', email: 'x@example.com', role: 'Sales' }, manager.token)).status, 403);
    assert.equal((await api('DELETE', `/employees/${staff.employee._id}`, undefined, manager.token)).status, 403);
    assert.equal((await api('PATCH', '/auth/shop-settings', { timezone: 'UTC' }, manager.token)).status, 401, 'owner-only endpoints reject staff tokens');
  });

  it('sees the team and its performance, without other accounts’ permission settings', async () => {
    const list = await api('GET', '/employees', undefined, manager.token);
    assert.equal(list.status, 200);
    assert.ok(list.body.employees.length >= 2);
    assert.equal(list.body.employees[0].permissionOverrides, undefined, 'overrides hidden from managers');
    assert.equal(list.body.employees[0].passwordHash, undefined);
    const asOwner = await api('GET', '/employees', undefined, owner.token);
    assert.ok(asOwner.body.employees.find(e => e._id === manager.employee._id).permissionOverrides, 'owner sees overrides');
    assert.equal((await api('GET', '/dashboard/partner/employees', undefined, manager.token)).status, 200);
    assert.equal((await api('GET', '/dashboard/partner/summary', undefined, manager.token)).status, 200);
    assert.equal((await api('GET', '/employees/permissions/registry', undefined, manager.token)).status, 200);
  });

  it('sees inventory without purchase costs, and the dashboard without cost values', async () => {
    const list = await api('GET', '/products/units', undefined, manager.token);
    assert.equal(list.status, 200);
    assert.equal(list.body.items[0].purchasePriceCents, undefined);
    const summary = await api('GET', '/dashboard/partner/summary', undefined, manager.token);
    assert.equal(summary.body.summary.stock.availablePurchaseValueCents, undefined);
    assert.ok(summary.body.summary.sales, 'sales totals are operational data');
  });

  it('can edit catalog details but not correct or delete units', async () => {
    const product = (await api('GET', `/products/${units[0].productId}`, undefined, manager.token)).body.product;
    const edit = await api('PATCH', `/products/${product._id}`, { ...product, description: 'Updated by manager' }, manager.token);
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal((await api('PATCH', `/products/units/${units[0]._id}`, { sellingPrice: 90000 }, manager.token)).status, 403);
    assert.equal((await api('DELETE', `/products/units/${units[0]._id}`, { reason: 'x' }, manager.token)).status, 403);
  });

  it('records sales through the same transactional service and sees every sale in the shop', async () => {
    const staffSale = await api('POST', '/sales/full-price', { unitId: units[0]._id, salePrice: 95000 }, staff.token);
    assert.equal(staffSale.status, 201);
    const managerSale = await api('POST', '/sales/full-price', { unitId: units[1]._id, salePrice: 98000 }, manager.token);
    assert.equal(managerSale.status, 201, JSON.stringify(managerSale.body));
    assert.equal(managerSale.body.sale.soldBy.employeeId, manager.employee.employeeId, 'soldBy is the manager');
    const again = await api('POST', '/sales/full-price', { unitId: units[1]._id, salePrice: 98000 }, manager.token);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_SOLD');
    const inst = await api('POST', '/sales/installment', { unitId: units[2]._id, totalPrice: 120000, downPayment: 20000, installmentCount: 5, customer: { name: 'Kashif', phone: '0301 1111111' } }, manager.token);
    assert.equal(inst.status, 201, JSON.stringify(inst.body));
    assert.equal(inst.body.agreement.schedule.length, 5);
    assert.ok(inst.body.agreement.customerId, 'customer record created');
    const all = await api('GET', '/sales', undefined, manager.token);
    assert.equal(all.body.total, 3, 'manager sees the staff sale too');
    assert.ok(all.body.items.find(s => s.soldBy.employeeId === staff.employee.employeeId), 'soldBy unchanged on others’ sales');
    assert.equal((await api('GET', '/sales', undefined, staff.token)).body.total, 1, 'employee still sees only their own');
    assert.equal((await api('GET', `/sales/${staffSale.body.sale._id}/receipt.pdf`, undefined, manager.token)).status, 200, 'receipts for any shop sale');
    units.staffSale = staffSale.body.sale;
    units.agreement = inst.body.agreement;
  });

  it('cannot cancel, refund, record payments, export or delete customers by default', async () => {
    assert.equal((await api('POST', `/sales/${units.staffSale._id}/cancel`, { reason: 'x' }, manager.token)).status, 403);
    assert.equal((await api('POST', `/sales/${units.staffSale._id}/refund`, { reason: 'x' }, manager.token)).status, 403);
    const pay = await api('POST', `/installments/${units.agreement._id}/payments`, { amount: 20000 }, manager.token);
    assert.equal(pay.status, 403);
    assert.equal((await api('GET', '/sales/full-price/export', undefined, manager.token)).status, 403);
    assert.equal((await api('DELETE', `/customers/${units.agreement.customerId}`, { reason: 'x' }, manager.token)).status, 403);
    assert.equal((await api('GET', `/installments/${units.agreement._id}`, undefined, manager.token)).status, 200, 'can still read the agreement');
  });

  it('cannot reach another shop', async () => {
    const theirs = await addUnits(other.token, [serial()]);
    assert.equal((await api('GET', `/products/units/${theirs[0]._id}`, undefined, manager.token)).status, 404);
    assert.equal((await api('POST', `/employees/${manager.employee._id}/promote-manager`, {}, other.token)).status, 404, 'another owner cannot touch this shop’s staff');
    assert.equal((await api('GET', '/employees', undefined, other.token)).body.employees.find(e => e._id === manager.employee._id), undefined);
  });
});

describe('configurable permissions', () => {
  it('the owner grants and revokes grantable permissions; the change applies to the open session at once', async () => {
    const granted = await api('PATCH', `/employees/${manager.employee._id}/permissions`, { permissionOverrides: { allow: ['installments.recordPayment', 'inventory.viewCost'], deny: [] }, reason: 'Collects installments' }, owner.token);
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    assert.ok(granted.body.permissions.effective.includes('installments.recordPayment'));
    const pay = await api('POST', `/installments/${units.agreement._id}/payments`, { amount: 20000 }, manager.token);
    assert.equal(pay.status, 201, 'same token, new permission');
    assert.equal((await api('GET', '/products/units', undefined, manager.token)).body.items[0].purchasePriceCents, 8000000, 'cost visible once granted');

    const denied = await api('PATCH', `/employees/${manager.employee._id}/permissions`, { permissionOverrides: { allow: [], deny: ['sales.viewAll'] } }, owner.token);
    assert.equal(denied.status, 200);
    assert.ok(!denied.body.permissions.effective.includes('sales.viewAll'));
    assert.equal((await api('GET', '/sales', undefined, manager.token)).body.total, 2, 'only their own sales now');
    assert.equal((await api('POST', `/installments/${units.agreement._id}/payments`, { amount: 10000 }, manager.token)).status, 403, 'grant removed again');
  });

  it('rejects unknown, owner-only and contradictory permission keys', async () => {
    const unknown = await api('PATCH', `/employees/${manager.employee._id}/permissions`, { allow: ['sales.anything'] }, owner.token);
    assert.equal(unknown.status, 400);
    const ownerOnly = await api('PATCH', `/employees/${manager.employee._id}/permissions`, { allow: ['employees.managePermissions'] }, owner.token);
    assert.equal(ownerOnly.status, 400);
    assert.match(ownerOnly.body.message, /can’t be changed/);
    assert.equal((await api('PATCH', `/employees/${manager.employee._id}/permissions`, { allow: ['sales.correct'], deny: ['sales.correct'] }, owner.token)).status, 400);
    assert.equal((await api('PATCH', `/employees/${staff.employee._id}/permissions`, { allow: ['sales.correct'] }, owner.token)).status, 409, 'plain employees have no overrides');
  });

  it('shows the permission picture and its history to the owner', async () => {
    const res = await api('GET', `/employees/${manager.employee._id}/permissions`, undefined, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.permissions.accessRole, 'manager');
    assert.ok(res.body.permissions.grantable.includes('sales.correct'));
    assert.deepEqual(res.body.permissions.overrides, { allow: [], deny: ['sales.viewAll'] });
    assert.deepEqual(res.body.history.map(h => h.action), ['MANAGER_PERMISSIONS_CHANGED', 'MANAGER_PERMISSIONS_CHANGED', 'EMPLOYEE_PROMOTED']);
    assert.equal(res.body.history[2].reason, 'Runs the counter');
  });

  it('job roles come from the server’s list; free text is refused', async () => {
    const roles = await api('GET', '/employees/roles', undefined, owner.token);
    assert.equal(roles.status, 200);
    assert.ok(roles.body.roles.includes('Sales') && roles.body.roles.includes('Cashier'));
    const freeText = await api('POST', '/employees', { name: 'Free Text', email: 'free@example.com', role: 'Wizard', password: 'TempPass99' }, owner.token);
    assert.equal(freeText.status, 400);
    assert.match(freeText.body.message, /role from the list/);
    const listed = await api('POST', '/employees', { name: 'Listed Role', email: 'listed@example.com', role: 'Cashier', password: 'TempPass99' }, owner.token);
    assert.equal(listed.status, 201);
    assert.equal((await api('PUT', `/employees/${listed.body.employee._id}`, { name: 'Listed Role', email: 'listed@example.com', role: 'Made up' }, owner.token)).status, 400);
  });

  it('the owner can create a manager directly, with overrides', async () => {
    const res = await api('POST', '/employees', { name: 'Direct Manager', email: 'direct@example.com', role: 'Store manager', password: 'TempPass99', accessRole: 'manager', permissionOverrides: { allow: ['sales.correct'], deny: [] } }, owner.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.employee.accessRole, 'manager');
    const history = await api('GET', `/employees/${res.body.employee._id}/permissions`, undefined, owner.token);
    assert.equal(history.body.history[0].action, 'MANAGER_CREATED');
    assert.ok(history.body.permissions.effective.includes('sales.correct'));
    assert.equal((await api('POST', '/employees', { name: 'Bad', email: 'bad@example.com', role: 'X', password: 'TempPass99', accessRole: 'owner' }, owner.token)).status, 400);
  });
});

describe('demotion and deactivation', () => {
  it('demoting clears overrides and removes elevated access from the open session', async () => {
    const res = await api('POST', `/employees/${manager.employee._id}/demote-manager`, { reason: 'Left the counter' }, owner.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.employee.accessRole, 'employee');
    assert.deepEqual(res.body.permissions.overrides, { allow: [], deny: [] });
    const me = await api('GET', '/employee/me', undefined, manager.token);
    assert.equal(me.status, 200, 'still signed in');
    assert.equal(me.body.employee.accessRole, 'employee');
    assert.equal((await api('GET', '/employees', undefined, manager.token)).status, 403);
    assert.equal((await api('GET', '/dashboard/partner/summary', undefined, manager.token)).status, 403);
    assert.equal((await api('GET', '/sales', undefined, manager.token)).body.total, 2, 'history intact: still their own two sales');
    assert.equal((await api('POST', `/employees/${manager.employee._id}/demote-manager`, {}, owner.token)).status, 409);
  });

  it('deactivating a manager rejects their session immediately', async () => {
    const promoted = await api('POST', `/employees/${manager.employee._id}/promote-manager`, {}, owner.token);
    assert.equal(promoted.status, 200);
    const off = await api('PUT', `/employees/${manager.employee._id}`, { name: 'Maria Manager', email: manager.employee.email, role: 'Sales', status: 'inactive' }, owner.token);
    assert.equal(off.status, 200);
    assert.equal((await api('GET', '/employee/me', undefined, manager.token)).status, 401, 'token version bumped');
    const relogin = await login(manager.employee.employeeId);
    assert.equal(relogin.status, 403);
    const history = await api('GET', `/employees/${manager.employee._id}/permissions`, undefined, owner.token);
    assert.equal(history.body.history[0].action, 'EMPLOYEE_DEACTIVATED');
  });
});
