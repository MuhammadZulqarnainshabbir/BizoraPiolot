// Master Admin Panel: platform identities, permissions, shop lifecycle, entitlements, audit.
// Covers the mandatory scenarios of the Master Admin brief (numbered in the test names).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { addUnits, api, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

const { createPlatformAdmin } = await import('../src/services/platform/platformAuthService.js');
const { seedPlatformDefaults } = await import('../src/services/platform/subscriptionService.js');
const { totpCode } = await import('../src/services/platform/totp.js');

const PA = '/platform-admin';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const installmentBody = (unitId) => ({ unitId, totalPrice: 1200, downPayment: 200, installmentCount: 5, frequency: 'MONTHLY', customer: { name: 'Kashif', phone: '+92 333 1112223' }, paymentMethod: 'CASH' });

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;
const STRONG = 'Platform-Pass-123';

/** Provisions an admin the way the CLI does, then signs in and completes the forced password change. */
async function newAdmin(role = 'SUPER_ADMIN') {
  const email = `${role.toLowerCase()}-${unique()}@bizora.test`;
  const admin = await createPlatformAdmin({ email, name: `${role} Tester`, role, password: STRONG, mustChangePassword: true });
  const first = await api('POST', `${PA}/auth/login`, { email, password: STRONG });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.setupRequired, true, 'a freshly provisioned admin must change the temporary password first');
  const password = `${STRONG}-changed`;
  const changed = await api('POST', `${PA}/auth/change-password`, { currentPassword: STRONG, password }, first.body.token);
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.setupRequired, false);
  return { id: String(admin._id), email, password, token: changed.body.token, role };
}

let superAdmin, support, finance;

before(async () => {
  await startApi();
  await seedPlatformDefaults();
  [superAdmin, support, finance] = await Promise.all([newAdmin('SUPER_ADMIN'), newAdmin('SUPPORT_ADMIN'), newAdmin('FINANCE_ADMIN')]);
});
after(stopApi);

describe('platform authentication (1, 13, 14)', () => {
  it('1. a super admin signs in, sees their profile and permissions, and reaches the dashboard', async () => {
    const me = await api('GET', `${PA}/me`, undefined, superAdmin.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.admin.role, 'SUPER_ADMIN');
    assert.ok(me.body.admin.permissions.includes('admins.manage'));
    assert.equal(me.body.admin.passwordHash, undefined);
    const dashboard = await api('GET', `${PA}/dashboard`, undefined, superAdmin.token);
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  });

  it('a set-up-only session (temporary password not yet changed) cannot use the console', async () => {
    const email = `setup-${unique()}@bizora.test`;
    await createPlatformAdmin({ email, name: 'Setup', role: 'SUPER_ADMIN', password: STRONG });
    const login = await api('POST', `${PA}/auth/login`, { email, password: STRONG });
    assert.equal(login.body.scope, 'setup');
    const blocked = await api('GET', `${PA}/dashboard`, undefined, login.body.token);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'SETUP_REQUIRED');
    const weak = await api('POST', `${PA}/auth/change-password`, { currentPassword: STRONG, password: 'short' }, login.body.token);
    assert.equal(weak.status, 400);
  });

  it('wrong credentials get one generic answer; five failures lock the account for a while', async () => {
    const email = `lock-${unique()}@bizora.test`;
    await createPlatformAdmin({ email, name: 'Lock', role: 'SUPPORT_ADMIN', password: STRONG });
    for (let i = 0; i < 5; i++) {
      const res = await api('POST', `${PA}/auth/login`, { email, password: 'Wrong-Pass-123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.message, 'Invalid email, password or code');
    }
    const locked = await api('POST', `${PA}/auth/login`, { email, password: STRONG });
    assert.equal(locked.status, 423);
    const unknown = await api('POST', `${PA}/auth/login`, { email: 'nobody@bizora.test', password: STRONG });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.message, 'Invalid email, password or code');
  });

  it('MFA: enrol with an authenticator code, then sign-in needs the code', async () => {
    const admin = await newAdmin('FINANCE_ADMIN');
    const setup = await api('POST', `${PA}/auth/mfa/setup`, {}, admin.token);
    assert.equal(setup.status, 200);
    assert.match(setup.body.otpauth, /^otpauth:\/\/totp\//);
    assert.equal((await api('POST', `${PA}/auth/mfa/enable`, { code: '000000' }, admin.token)).status, 400);
    const enabled = await api('POST', `${PA}/auth/mfa/enable`, { code: totpCode(setup.body.secret) }, admin.token);
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    assert.equal(enabled.body.admin.mfaEnabled, true);
    const noCode = await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password });
    assert.equal(noCode.status, 401);
    assert.equal(noCode.body.code, 'MFA_REQUIRED');
    const withCode = await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password, totp: totpCode(setup.body.secret) });
    assert.equal(withCode.status, 200);
    assert.equal(withCode.body.admin.mfa, undefined, 'the secret never leaves the server');
  });

  it('14. logout, "revoke sessions" and deactivation end every session at once', async () => {
    const admin = await newAdmin('SUPPORT_ADMIN');
    const other = (await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password })).body.token;
    assert.equal((await api('POST', `${PA}/auth/logout`, {}, admin.token)).status, 204);
    assert.equal((await api('GET', `${PA}/me`, undefined, admin.token)).status, 401);
    assert.equal((await api('GET', `${PA}/me`, undefined, other)).status, 401, 'logout revokes the other session too');

    const again = (await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password })).body.token;
    assert.equal((await api('GET', `${PA}/dashboard`, undefined, again)).status, 200);
    assert.equal((await api('POST', `${PA}/administrators/${admin.id}/revoke-sessions`, { reason: 'Laptop lost' }, superAdmin.token)).status, 204);
    assert.equal((await api('GET', `${PA}/dashboard`, undefined, again)).status, 401);

    const last = (await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password })).body.token;
    assert.equal((await api('PATCH', `${PA}/administrators/${admin.id}`, { status: 'inactive', reason: 'Left the company' }, superAdmin.token)).status, 200);
    assert.equal((await api('GET', `${PA}/dashboard`, undefined, last)).status, 401);
    assert.equal((await api('POST', `${PA}/auth/login`, { email: admin.email, password: admin.password })).status, 403);
  });

  it('13. a forged token without the platform audience, or with a shop role, is refused', async () => {
    const admin = await newAdmin('SUPER_ADMIN');
    const noAudience = jwt.sign({ sub: admin.id, role: 'platform-admin', ver: 1, exp: Math.floor(Date.now() / 1000) + 600 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal((await api('GET', `${PA}/dashboard`, undefined, noAudience)).status, 401);
    const wrongRole = jwt.sign({ sub: admin.id, role: 'owner', aud: 'platform', ver: 1, exp: Math.floor(Date.now() / 1000) + 600 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal((await api('GET', `${PA}/dashboard`, undefined, wrongRole)).status, 401);
  });
});

describe('platform and shop domains stay apart (2, 3, 4, 6, 12)', () => {
  it('2/3/4. owner, manager and employee tokens are refused by every platform endpoint', async () => {
    const owner = await newShop('Isolated Shop');
    const employee = await newEmployee(owner, 'Eve');
    const manager = await newEmployee(owner, 'Mani');
    assert.equal((await api('POST', `/employees/${manager.employee._id ?? manager.employee.id}/promote-manager`, {}, owner.token)).status, 200);
    const managerToken = (await api('POST', '/employee/login', { shopId: owner.shop.id, employeeId: manager.employee.employeeId, password: 'NewPass123' })).body.token;
    for (const [who, token] of [['owner', owner.token], ['employee', employee.token], ['manager', managerToken]]) {
      for (const path of ['/me', '/dashboard', '/shops', '/administrators', '/audit-logs', '/settings']) {
        const res = await api('GET', `${PA}${path}`, undefined, token);
        assert.equal(res.status, 401, `${who} ${path} → ${res.status}`);
      }
      assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: 'x' }, token)).status, 401, `${who} suspend`);
    }
  });

  it('6. a platform token (finance admin) opens no shop endpoint: inventory, sales, customers, employees', async () => {
    const owner = await newShop('Finance Target');
    const [unit] = await addUnits(owner.token, [serial()]);
    for (const [method, path, body] of [
      ['POST', '/products', { product: { name: 'X', brand: 'X', model: 'X', category: 'LED TV & Audio', subCategory: 'Smart LED TVs' }, sellingPrice: 1, purchasePrice: 1, serialNumbers: [serial()] }],
      ['GET', '/products', undefined],
      ['PATCH', `/products/units/${unit._id}`, { sellingPrice: 1 }],
      ['POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }],
      ['GET', '/sales', undefined],
      ['GET', '/customers', undefined],
      ['GET', '/employees', undefined],
      ['GET', '/dashboard/partner/summary', undefined],
      ['GET', '/auth/me', undefined]
    ]) {
      const res = await api(method, path, body, finance.token);
      assert.equal(res.status, 401, `${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal((await api('GET', `${PA}/shops/${owner.shop.id}/units`, undefined, superAdmin.token)).status, 404, 'no platform route touches inventory');
  });

  it('12. suspending one shop changes nothing for another, and shops still cannot see each other', async () => {
    const a = await newShop('Shop A');
    const b = await newShop('Shop B');
    const [unitB] = await addUnits(b.token, [serial()]);
    assert.equal((await api('POST', `${PA}/shops/${a.shop.id}/suspend`, { reason: 'Payment overdue' }, superAdmin.token)).status, 200);
    assert.equal((await api('GET', '/products', undefined, b.token)).status, 200);
    assert.equal((await api('GET', `/products/units/${unitB._id}`, undefined, a.token)).status, 403, 'suspended shop is blocked before anything else');
    assert.equal((await api('POST', `${PA}/shops/${a.shop.id}/reactivate`, { reason: 'Paid' }, superAdmin.token)).status, 200);
    assert.equal((await api('GET', `/products/units/${unitB._id}`, undefined, a.token)).status, 404, 'other shop’s unit stays invisible');
  });
});

describe('platform permissions (5, 13)', () => {
  it('5. a support admin can read shops but cannot manage administrators, settings, plans or the audit log', async () => {
    assert.equal((await api('GET', `${PA}/shops`, undefined, support.token)).status, 200);
    for (const [method, path, body] of [
      ['GET', '/administrators', undefined],
      ['POST', '/administrators', { email: 'x@bizora.test', name: 'X', role: 'SUPER_ADMIN' }],
      ['PATCH', `/administrators/${superAdmin.id}`, { status: 'inactive' }],
      ['POST', `/administrators/${superAdmin.id}/reset-password`, {}],
      ['GET', '/audit-logs', undefined],
      ['PATCH', '/settings', { registrationApproval: 'manual' }],
      ['POST', '/plans', { key: 'X', name: 'X' }]
    ]) {
      const res = await api(method, `${PA}${path}`, body, support.token);
      assert.equal(res.status, 403, `${method} ${path} → ${res.status}`);
      assert.equal(res.body.code, 'FORBIDDEN');
    }
  });

  it('13. nobody can escalate: support admins cannot change roles, extra fields are ignored, the last super admin stays', async () => {
    const own = await api('PATCH', `${PA}/administrators/${support.id}`, { role: 'SUPER_ADMIN' }, support.token);
    assert.equal(own.status, 403);
    // Mass assignment: status, mfa, passwordHash and tokenVersion in the create body are ignored.
    const created = await api('POST', `${PA}/administrators`, { email: `mass-${unique()}@bizora.test`, name: 'Mass', role: 'SUPPORT_ADMIN', status: 'inactive', mfa: { enabled: true }, passwordHash: 'x', tokenVersion: 99, mustChangePassword: false }, superAdmin.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.admin.status, 'active');
    assert.equal(created.body.admin.mfaEnabled, false);
    assert.equal(created.body.admin.mustChangePassword, true);
    assert.match(created.body.temporaryPassword, /.{16,}/);
    assert.equal((await api('POST', `${PA}/administrators`, { email: 'bad@bizora.test', name: 'Bad', role: 'ROOT' }, superAdmin.token)).status, 400);
    // A super admin cannot remove their own access.
    assert.equal((await api('PATCH', `${PA}/administrators/${superAdmin.id}`, { role: 'SUPPORT_ADMIN' }, superAdmin.token)).status, 409);
    assert.equal((await api('PATCH', `${PA}/administrators/${superAdmin.id}`, { status: 'inactive' }, superAdmin.token)).status, 409);
    // Role changes revoke the admin's sessions.
    const temp = await api('POST', `${PA}/auth/login`, { email: created.body.admin.email, password: created.body.temporaryPassword });
    assert.equal(temp.status, 200);
    assert.equal((await api('PATCH', `${PA}/administrators/${created.body.admin.id}`, { role: 'FINANCE_ADMIN' }, superAdmin.token)).status, 200);
    assert.equal((await api('GET', `${PA}/me`, undefined, temp.body.token)).status, 401);
  });
});

describe('shop lifecycle (7, 8, 9, 10, 15)', () => {
  it('7/8/9/10. suspend with a reason: owner and employees are locked out, records stay; reactivate restores access; both are audited', async () => {
    const owner = await newShop('Lifecycle Shop');
    const employee = await newEmployee(owner, 'Lina');
    const [unit] = await addUnits(owner.token, [serial()]);
    const sale = await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1000 }, employee.token);
    assert.equal(sale.status, 201);

    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, {}, superAdmin.token)).status, 400, 'a reason is required');
    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: 'Fraud report' }, support.token)).status, 403, 'support admins cannot suspend');
    const suspended = await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: 'Fraud report under review' }, superAdmin.token);
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
    assert.equal(suspended.body.shop.status, 'SUSPENDED');
    assert.equal(suspended.body.shop.statusReason, 'Fraud report under review');

    // Policy: nobody from the shop can sign in or use the APIs; existing sessions are cut too.
    const ownerLogin = await api('POST', '/auth/login', { email: (await mongoose.model('Shop').findById(owner.shop.id)).email, password: 'OwnerPass123' });
    assert.equal(ownerLogin.status, 403);
    assert.equal(ownerLogin.body.code, 'SHOP_SUSPENDED');
    const employeeLogin = await api('POST', '/employee/login', { shopId: owner.shop.id, employeeId: employee.employee.employeeId, password: 'NewPass123' });
    assert.equal(employeeLogin.status, 403);
    assert.equal(employeeLogin.body.code, 'SHOP_SUSPENDED');
    for (const [token, path] of [[owner.token, '/products'], [owner.token, '/auth/me'], [employee.token, '/sales/my-sales'], [employee.token, '/employee/me']]) {
      const res = await api('GET', path, undefined, token);
      assert.equal(res.status, 403, `${path} → ${res.status}`);
      assert.equal(res.body.code, 'SHOP_SUSPENDED');
    }
    // Records are retained, visible to the platform as counts only.
    const details = await api('GET', `${PA}/shops/${owner.shop.id}`, undefined, support.token);
    assert.equal(details.status, 200);
    assert.equal(details.body.shop.status, 'SUSPENDED');
    assert.equal(details.body.counts.units, 1);
    assert.equal(details.body.counts.completedSales, 1);
    assert.equal(details.body.counts.employees, 1);

    // A second suspension is an invalid transition; reactivation restores everything.
    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: 'again' }, superAdmin.token)).status, 409);
    const reactivated = await api('POST', `${PA}/shops/${owner.shop.id}/reactivate`, { reason: 'Report resolved' }, superAdmin.token);
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.shop.status, 'ACTIVE');
    assert.equal((await api('GET', '/products', undefined, owner.token)).status, 200, 'the owner’s existing session works again');
    assert.equal((await api('POST', '/employee/login', { shopId: owner.shop.id, employeeId: employee.employee.employeeId, password: 'NewPass123' })).status, 200);
    assert.equal((await api('GET', `/sales/${sale.body.sale._id}`, undefined, employee.token)).status, 200, 'the sale survived');

    // 10. Both actions are in the platform audit log with actor, reason and before/after.
    const log = await api('GET', `${PA}/audit-logs?targetId=${owner.shop.id}`, undefined, superAdmin.token);
    assert.equal(log.status, 200);
    const actions = log.body.items.map(e => e.action);
    assert.ok(actions.includes('SHOP_SUSPENDED') && actions.includes('SHOP_REACTIVATED'), actions.join(','));
    const entry = log.body.items.find(e => e.action === 'SHOP_SUSPENDED');
    assert.equal(entry.adminEmail, superAdmin.email);
    assert.equal(entry.reason, 'Fraud report under review');
    assert.deepEqual(entry.before, { status: 'ACTIVE' });
    assert.deepEqual(entry.after, { status: 'SUSPENDED' });
  });

  it('two admins acting at once: one suspension succeeds, the other sees a conflict', async () => {
    const owner = await newShop('Race Shop');
    const results = await Promise.all([1, 2, 3].map(i => api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: `attempt ${i}` }, superAdmin.token)));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
    assert.equal((await api('GET', `${PA}/audit-logs?targetId=${owner.shop.id}&action=SHOP_SUSPENDED`, undefined, superAdmin.token)).body.total, 1);
  });

  it('deactivation keeps the records and can be undone; manual registration approval holds new shops as PENDING', async () => {
    const owner = await newShop('Deactivate Me');
    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/deactivate`, { reason: 'Owner closed the business' }, superAdmin.token)).status, 200);
    assert.equal((await api('GET', '/products', undefined, owner.token)).body.code, 'SHOP_DEACTIVATED');
    assert.equal(await mongoose.model('Shop').countDocuments({ _id: owner.shop.id }), 1, 'no hard delete');
    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/reactivate`, { reason: 'Reopened' }, superAdmin.token)).status, 200);

    assert.equal((await api('PATCH', `${PA}/settings`, { registrationApproval: 'manual' }, superAdmin.token)).status, 200);
    try {
      const email = `pending-${unique()}@example.com`;
      const registered = await api('POST', '/auth/register-shop', { shopName: 'Pending Shop', ownerName: 'P', email, phone: '0300', address: 'Karachi', password: 'OwnerPass123', confirmPassword: 'OwnerPass123' });
      assert.equal(registered.status, 201);
      assert.equal(registered.body.pendingApproval, true);
      const login = await api('POST', '/auth/login', { email, password: 'OwnerPass123' });
      assert.equal(login.status, 403);
      assert.equal(login.body.code, 'SHOP_PENDING');
      const pending = await api('GET', `${PA}/shops?status=PENDING`, undefined, superAdmin.token);
      const shop = pending.body.items.find(s => s.email === email);
      assert.ok(shop);
      assert.equal((await api('POST', `${PA}/shops/${shop._id}/approve`, { reason: 'Verified business documents' }, superAdmin.token)).status, 200);
      assert.equal((await api('POST', '/auth/login', { email, password: 'OwnerPass123' })).status, 200);
    } finally {
      await api('PATCH', `${PA}/settings`, { registrationApproval: 'automatic' }, superAdmin.token);
    }
  });

  it('15. existing shop sign-in keeps working for active shops (owner and employee)', async () => {
    const owner = await newShop('Still Works');
    assert.ok(owner.token);
    const employee = await newEmployee(owner, 'Sam');
    assert.ok(employee.token);
    assert.equal((await api('GET', '/auth/me', undefined, owner.token)).status, 200);
    assert.equal((await api('GET', '/employee/me', undefined, employee.token)).status, 200);
  });
});

describe('what the platform can see (11, 18)', () => {
  it('11. shop details, diagnostics, search and analytics never carry customer records or CNIC pictures', async () => {
    const owner = await newShop('Privacy Shop');
    const customer = await api('POST', '/customers', { name: 'Private Person', phone: '0301-7654321', cnic: '35202-7654321-9', address: 'Secret Street' }, owner.token);
    assert.equal(customer.status, 201);
    assert.equal((await api('POST', `/customers/${customer.body.customer._id}/documents`, { kind: 'CNIC_FRONT', image: PNG }, owner.token)).status, 201);
    const responses = await Promise.all([
      api('GET', `${PA}/shops/${owner.shop.id}`, undefined, superAdmin.token),
      api('GET', `${PA}/shops/${owner.shop.id}/diagnostics`, undefined, superAdmin.token),
      api('GET', `${PA}/shops?search=Privacy`, undefined, superAdmin.token),
      api('GET', `${PA}/analytics`, undefined, superAdmin.token),
      api('GET', `${PA}/dashboard`, undefined, superAdmin.token)
    ]);
    for (const res of responses) {
      assert.equal(res.status, 200);
      const text = JSON.stringify(res.body);
      for (const secret of ['3520276543219', 'Private Person', 'Secret Street', '0301', 'iVBORw0KGgo', 'passwordHash']) assert.ok(!text.includes(secret), `response leaks ${secret}`);
    }
    assert.equal(responses[0].body.counts.customers, 1, 'only the count is visible');
    for (const path of [`/shops/${owner.shop.id}/customers`, `/shops/${owner.shop.id}/customers/${customer.body.customer._id}/documents`, '/customers']) {
      assert.equal((await api('GET', `${PA}${path}`, undefined, superAdmin.token)).status, 404, `${path} must not exist`);
    }
    assert.equal((await api('GET', `${PA}/shops/${owner.shop.id}/diagnostics`, undefined, finance.token)).status, 403, 'finance admins have no diagnostics');
  });

  it('18. dashboard counts match the database, and Bizora revenue is never shop sales', async () => {
    const Shop = mongoose.model('Shop');
    const owner = await newShop('Metrics Shop');
    const [unit] = await addUnits(owner.token, [serial()]);
    assert.equal((await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 250000 }, owner.token)).status, 201);
    assert.equal((await api('POST', `${PA}/shops/${owner.shop.id}/suspend`, { reason: 'metrics' }, superAdmin.token)).status, 200);
    const dashboard = await api('GET', `${PA}/dashboard`, undefined, finance.token);
    assert.equal(dashboard.status, 200);
    const [total, active, suspended, pending, deactivated] = await Promise.all([
      Shop.countDocuments(), Shop.countDocuments({ status: 'ACTIVE' }), Shop.countDocuments({ status: 'SUSPENDED' }), Shop.countDocuments({ status: 'PENDING' }), Shop.countDocuments({ status: 'DEACTIVATED' })
    ]);
    assert.deepEqual(dashboard.body.shops, { total, ACTIVE: active, SUSPENDED: suspended, PENDING: pending, DEACTIVATED: deactivated });
    assert.ok(suspended >= 1);
    assert.equal(dashboard.body.users.activeEmployees, await mongoose.model('Employee').countDocuments({ status: 'active' }));
    assert.equal(dashboard.body.subscriptions.mrrCents, 0, 'no prices are configured, so no recurring revenue is reported');
    assert.equal(dashboard.body.subscriptions.pricesConfigured, false);
    assert.ok(!JSON.stringify(dashboard.body).includes('250000'), 'the shop’s sale is not platform revenue');
    assert.equal(typeof dashboard.body.api.since, 'string');
    assert.ok(dashboard.body.api.totals.requests > 0);
    assert.equal(dashboard.body.api.hourly.length, 24);
    assert.equal((await api('GET', `${PA}/health`, undefined, support.token)).body.database, 'ok');
    assert.equal((await api('GET', `${PA}/health`, undefined, finance.token)).status, 403);
  });
});

describe('plans, subscriptions and entitlements (19, 16, 17)', () => {
  it('seeded plans are editable; a plan with a price makes recurring revenue appear', async () => {
    const plans = await api('GET', `${PA}/plans`, undefined, finance.token);
    assert.equal(plans.status, 200);
    assert.deepEqual(plans.body.plans.map(p => p.key), ['FREE_TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']);
    assert.equal((await api('PATCH', `${PA}/plans/BASIC`, { priceCents: -1 }, superAdmin.token)).status, 400);
    assert.equal((await api('PATCH', `${PA}/plans/BASIC`, { features: ['teleport'] }, superAdmin.token)).status, 400);
    const updated = await api('PATCH', `${PA}/plans/BASIC`, { priceCents: 150000, limits: { maxEmployees: 1, maxInventoryUnits: 2, maxBranches: 1 } }, superAdmin.token);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.plan.limits.maxEmployees, 1);
    const created = await api('POST', `${PA}/plans`, { key: 'starter_2026', name: 'Starter', features: ['receipts_pdf'], limits: {} }, superAdmin.token);
    assert.equal(created.status, 201);
    assert.equal(created.body.plan.key, 'STARTER_2026');
    assert.equal(created.body.plan.limits.maxEmployees, null, 'empty limit means unlimited');
  });

  it('19. a feature needs BOTH the shop’s plan and the user’s permission; limits are enforced; downgrades keep records readable', async () => {
    const owner = await newShop('Entitled Shop');
    const employee = await newEmployee(owner, 'Eli');
    const [u1, u2] = await addUnits(owner.token, [serial(), serial()]);
    const sale = await api('POST', '/sales/installment', installmentBody(u1._id), owner.token);
    assert.equal(sale.status, 201, 'installments are included in the default plan');
    assert.equal((await api('GET', `/sales/${sale.body.sale._id}/receipt.pdf`, undefined, owner.token)).status, 200);
    assert.equal((await api('GET', '/sales/full-price/export', undefined, employee.token)).status, 403, 'employee lacks reports.export even on a full plan');

    // Put the shop on BASIC (no csv_export, no manager_role; limits 1 employee / 2 units from the test above).
    const sub = await api('PUT', `${PA}/shops/${owner.shop.id}/subscription`, { planKey: 'BASIC', status: 'ACTIVE', reason: 'Signed basic contract' }, finance.token);
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
    assert.equal(sub.body.entitlements.planKey, 'BASIC');
    assert.ok(!sub.body.entitlements.features.includes('csv_export'));
    const exportBlocked = await api('GET', '/sales/full-price/export', undefined, owner.token);
    assert.equal(exportBlocked.status, 403);
    assert.equal(exportBlocked.body.code, 'FEATURE_NOT_AVAILABLE');
    const promote = await api('POST', `/employees/${employee.employee._id ?? employee.employee.id}/promote-manager`, {}, owner.token);
    assert.equal(promote.status, 403);
    assert.equal(promote.body.code, 'FEATURE_NOT_AVAILABLE');
    const createManager = await api('POST', '/employees', { name: 'M', email: `m-${unique()}@example.com`, role: 'Sales', password: 'TempPass99', accessRole: 'manager' }, owner.token);
    assert.equal(createManager.status, 403);
    const tooMany = await api('POST', '/employees', { name: 'Extra', email: `x-${unique()}@example.com`, role: 'Sales', password: 'TempPass99' }, owner.token);
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.code, 'PLAN_LIMIT');
    const tooMuchStock = await api('POST', '/products', { product: { name: 'X', brand: 'X', model: 'X', category: 'LED TV & Audio', subCategory: 'Smart LED TVs' }, sellingPrice: 1, purchasePrice: 1, serialNumbers: [serial()] }, owner.token);
    assert.equal(tooMuchStock.status, 409);
    assert.equal(tooMuchStock.body.code, 'PLAN_LIMIT');
    // Still readable: existing sales, units, receipts (BASIC includes receipts) and the agreement.
    assert.equal((await api('GET', '/sales', undefined, owner.token)).status, 200);
    assert.equal((await api('GET', `/installments/${sale.body.agreement._id}`, undefined, owner.token)).status, 200);
    assert.equal((await api('POST', '/sales/full-price', { unitId: u2._id, salePrice: 1 }, owner.token)).status, 201, 'selling is never gated');

    // A platform override switches one feature on for this shop only; the employee still can't use it.
    const override = await api('PUT', `${PA}/shops/${owner.shop.id}/features/csv_export`, { enabled: true, reason: 'Trial of exports' }, superAdmin.token);
    assert.equal(override.status, 200);
    assert.ok(override.body.entitlements.features.includes('csv_export'));
    assert.equal((await api('PUT', `${PA}/shops/${owner.shop.id}/features/csv_export`, { enabled: true }, finance.token)).status, 403, 'finance admins cannot change features');
    assert.equal((await api('GET', '/sales/full-price/export', undefined, owner.token)).status, 200);
    assert.equal((await api('GET', '/sales/full-price/export', undefined, employee.token)).status, 403, 'the entitlement never bypasses the user’s permission');
    assert.equal((await api('DELETE', `${PA}/shops/${owner.shop.id}/features/csv_export`, undefined, superAdmin.token)).status, 200);
    assert.equal((await api('GET', '/sales/full-price/export', undefined, owner.token)).status, 403);

    // A lapsed subscription removes plan features but keeps records readable.
    assert.equal((await api('PUT', `${PA}/shops/${owner.shop.id}/subscription`, { planKey: 'PROFESSIONAL', status: 'EXPIRED' }, finance.token)).status, 200);
    const lapsed = await api('POST', '/sales/installment', installmentBody(u2._id), owner.token);
    assert.equal(lapsed.status, 403);
    assert.equal(lapsed.body.code, 'SUBSCRIPTION_INACTIVE');
    assert.equal((await api('GET', `/installments/${sale.body.agreement._id}/payments`, undefined, owner.token)).status, 200);
    const log = await api('GET', `${PA}/audit-logs?targetId=${owner.shop.id}`, undefined, superAdmin.token);
    assert.ok(log.body.items.some(e => e.action === 'SUBSCRIPTION_SET' && e.reason === 'Signed basic contract'));
    assert.ok(log.body.items.some(e => e.action === 'FEATURE_OVERRIDE_SET'));
  });

  it('16/17. on the default plan, full-price and installment sales, payments and receipts work as before', async () => {
    const owner = await newShop('Regression Shop');
    const employee = await newEmployee(owner, 'Rae');
    const [u1, u2] = await addUnits(owner.token, [serial(), serial()]);
    const full = await api('POST', '/sales/full-price', { unitId: u1._id, salePrice: 50000, customer: { name: 'Buyer' } }, employee.token);
    assert.equal(full.status, 201);
    const inst = await api('POST', '/sales/installment', installmentBody(u2._id), employee.token);
    assert.equal(inst.status, 201);
    const payment = await api('POST', `/installments/${inst.body.agreement._id}/payments`, { amount: 200, paymentMethod: 'CASH' }, owner.token);
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    assert.equal((await api('GET', `/installments/${inst.body.agreement._id}/payments/${payment.body.payment._id}/receipt.pdf`, undefined, owner.token)).status, 200);
    assert.equal((await api('GET', `/sales/${full.body.sale._id}/receipt.pdf`, undefined, employee.token)).status, 200);
  });
});
