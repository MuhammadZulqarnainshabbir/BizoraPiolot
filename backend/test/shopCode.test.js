import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, newShop, startApi, stopApi } from './helpers.js';

// Shop codes: the mobile app's way for an employee to name their shop (services/shopCodes.js).

let shopA, shopB, empA;
before(async () => {
  await startApi();
  shopA = await newShop('Shop A');
  shopB = await newShop('Shop B');
  const created = await api('POST', '/employees', { name: 'Ayesha', email: 'ayesha@example.com', role: 'Sales', password: 'TempPass99' }, shopA.token);
  empA = created.body.employee;
});
after(stopApi);

describe('shop codes', () => {
  it('every shop gets a unique 6-character code, visible to its owner', async () => {
    assert.match(shopA.shop.shopCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.match(shopB.shop.shopCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.notEqual(shopA.shop.shopCode, shopB.shop.shopCode);
    const me = await api('GET', '/auth/me', undefined, shopA.token);
    assert.equal(me.body.shop.shopCode, shopA.shop.shopCode);
  });

  it('a shop can be looked up by its code, ignoring case, spaces and dashes', async () => {
    const code = shopA.shop.shopCode;
    const res = await api('GET', `/employee/shops/by-code/${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.shop.id, shopA.shop.id);
    assert.equal(res.body.shop.shopName, 'Shop A');
    assert.equal(res.body.shop.shopCode, code);
    assert.equal((await api('GET', '/employee/shops/by-code/ZZZZZZ')).status, 404);
    assert.equal((await api('GET', '/employee/shops/by-code/not-a-code')).status, 404);
  });

  it('an employee signs in with shop code + employee ID + password', async () => {
    const res = await api('POST', '/employee/login', { shopCode: shopA.shop.shopCode.toLowerCase(), employeeId: empA.employeeId, password: 'TempPass99' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.shop.id, shopA.shop.id);
    assert.equal(res.body.employee.employeeId, empA.employeeId);
    assert.equal(res.body.employee.mustChangePassword, true);
    // The token is a normal employee session.
    const me = await api('GET', '/employee/me', undefined, res.body.token);
    assert.equal(me.status, 200);
  });

  it('the right employee ID and password with another shop’s code is refused', async () => {
    const res = await api('POST', '/employee/login', { shopCode: shopB.shop.shopCode, employeeId: empA.employeeId, password: 'TempPass99' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid shop code, employee ID or password');
  });

  it('a wrong or malformed shop code is refused with the same message as a wrong password', async () => {
    const wrongCode = await api('POST', '/employee/login', { shopCode: 'ZZZZZZ', employeeId: empA.employeeId, password: 'TempPass99' });
    const wrongPassword = await api('POST', '/employee/login', { shopCode: shopA.shop.shopCode, employeeId: empA.employeeId, password: 'nope-nope' });
    const malformed = await api('POST', '/employee/login', { shopCode: '!!', employeeId: empA.employeeId, password: 'TempPass99' });
    for (const res of [wrongCode, wrongPassword, malformed]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.message, 'Invalid shop code, employee ID or password');
    }
    const missing = await api('POST', '/employee/login', { shopCode: shopA.shop.shopCode, employeeId: '', password: 'x' });
    assert.equal(missing.status, 400);
  });

  it('signing in by shop ID (the web app) still works', async () => {
    const res = await api('POST', '/employee/login', { shopId: shopA.shop.id, employeeId: empA.employeeId, password: 'TempPass99' });
    assert.equal(res.status, 200);
    assert.equal(res.body.shop.shopCode, shopA.shop.shopCode);
  });
});
