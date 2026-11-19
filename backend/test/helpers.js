// Test harness: starts the API in-process against a throwaway database and offers small helpers.
// Needs MongoDB running as a replica set (same as the app). Override with TEST_MONGO_URI.
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.CLIENT_ORIGIN ??= 'http://localhost:4200';
const TEST_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/bizora_pilot_test';

const { createApp } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');

let server;
export let baseUrl;

export async function startApi() {
  await connectDB(TEST_URI);
  await mongoose.connection.db.dropDatabase();
  // Dropping removed the indexes; Model.init() won't rebuild them (it only runs once per process).
  await Promise.all(Object.values(mongoose.models).map(m => m.createIndexes()));
  await new Promise(resolve => { server = createApp().listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

export async function stopApi() {
  await new Promise(resolve => server.close(resolve));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
}

/** JSON request; returns { status, body }. */
export async function api(method, path, body, token) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* CSV etc. */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Registers a shop and logs its owner in. */
export async function newShop(name = 'Test Shop') {
  const email = `owner-${unique()}@example.com`, password = 'OwnerPass123';
  await api('POST', '/auth/register-shop', { shopName: name, ownerName: 'Owner', email, phone: '+92 300 0000000', address: 'Lahore', password, confirmPassword: password });
  const login = await api('POST', '/auth/login', { email, password });
  return { token: login.body.token, shop: login.body.shop, permissions: login.body.permissions };
}

/** Creates an employee for the shop and returns a token after the first-login password change. */
export async function newEmployee(owner, name = 'Employee') {
  const created = await api('POST', '/employees', { name, email: `emp-${unique()}@example.com`, role: 'Sales', password: 'TempPass99' }, owner.token);
  const login = await api('POST', '/employee/login', { shopId: owner.shop.id, employeeId: created.body.employee.employeeId, password: 'TempPass99' });
  const changed = await api('POST', '/employee/change-password', { currentPassword: 'TempPass99', password: 'NewPass123', confirmPassword: 'NewPass123' }, login.body.token);
  return { token: changed.body.token, employee: created.body.employee, permissions: login.body.permissions };
}

export const productInput = ({ product, ...overrides } = {}) => ({
  product: { name: 'Samsung Galaxy S25', brand: 'Samsung', model: 'Galaxy S25', category: 'LED TV & Audio', subCategory: 'Smart LED TVs', ...product },
  sellingPrice: 250000, purchasePrice: 200000, ...overrides
});

/** Adds units with the given serials; returns the created units. */
export async function addUnits(token, serials, overrides = {}) {
  const res = await api('POST', '/products', { ...productInput(overrides), serialNumbers: serials }, token);
  if (res.status !== 201) throw new Error(`addUnits failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.units;
}

export const serial = (prefix = 'SN') => `${prefix}-${unique()}`.toUpperCase();
