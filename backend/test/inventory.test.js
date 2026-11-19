import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { addUnits, api, newEmployee, newShop, productInput, serial, startApi, stopApi } from './helpers.js';

let owner, employee, otherShop;
before(async () => {
  await startApi();
  owner = await newShop('Inventory Shop');
  employee = await newEmployee(owner, 'Ayesha');
  otherShop = await newShop('Other Shop');
});
after(stopApi);

describe('adding products with serial numbers', () => {
  it('adds one unit per serial number and reuses the catalog entry for the same brand + model', async () => {
    const res = await api('POST', '/products', { ...productInput(), serialNumbers: [serial(), serial(), serial()] }, owner.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.units.length, 3);
    assert.ok(res.body.units.every(u => u.status === 'AVAILABLE' && u.productId === res.body.product._id));
    const again = await api('POST', '/products', { ...productInput({ product: { brand: ' samsung ', model: 'GALAXY  S25' } }), serialNumbers: [serial()] }, owner.token);
    assert.equal(again.body.product._id, res.body.product._id, 'same brand/model (any case/spacing) → same product');
    assert.equal(again.body.createdProduct, false);
  });

  it('rejects a product without serial numbers', async () => {
    for (const serialNumbers of [undefined, [], ['  ']]) {
      const res = await api('POST', '/products', { ...productInput(), serialNumbers }, owner.token);
      assert.equal(res.status, 400, JSON.stringify(serialNumbers));
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    }
  });

  it('rejects duplicate serial numbers (in the request, and already in stock, ignoring case and spaces)', async () => {
    const s = serial();
    let res = await api('POST', '/products', { ...productInput(), serialNumbers: [s, s.toLowerCase()] }, owner.token);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DUPLICATE_SERIAL');
    await addUnits(owner.token, [s]);
    res = await api('POST', '/products', { ...productInput(), serialNumbers: [` ${s.slice(0, 3)} ${s.slice(3).toLowerCase()} `] }, employee.token);
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.details.serials, [s]);
  });

  it('is all-or-nothing: one duplicate means none of the batch is added', async () => {
    const existing = serial(); await addUnits(owner.token, [existing]);
    const fresh = serial();
    await api('POST', '/products', { ...productInput(), serialNumbers: [fresh, existing] }, owner.token);
    const lookup = await api('GET', `/products/units/by-serial/${fresh}`, undefined, owner.token);
    assert.equal(lookup.status, 404);
  });

  it('keeps serial numbers as text, including leading zeros', async () => {
    const [unit] = await addUnits(owner.token, ['000123ABC']);
    assert.equal(unit.serialNumber, '000123ABC');
  });

  it('enforces uniqueness in the database, not just the API', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const Unit = mongoose.model('InventoryUnit');
    const doc = await Unit.findById(unit._id).lean();
    await assert.rejects(Unit.create({ ...doc, _id: undefined }), err => err.code === 11000);
  });

  it('validates the category, prices and image links', async () => {
    const bad = [
      { ...productInput({ product: { category: 'Toys', subCategory: 'Lego' } }) },
      { ...productInput({ sellingPrice: -1 }) },
      { ...productInput({ purchasePrice: 10.001 }) },
      { ...productInput({ product: { imageUrls: ['javascript:alert(1)'] } }) }
    ];
    for (const body of bad) assert.equal((await api('POST', '/products', { ...body, serialNumbers: [serial()] }, owner.token)).status, 400);
  });
});

describe('employees and inventory', () => {
  it('employees can add stock; the unit records who added it', async () => {
    const [unit] = await addUnits(employee.token, [serial('EMP')]);
    assert.equal(unit.addedBy.type, 'employee');
    assert.equal(unit.addedBy.employeeId, employee.employee.employeeId);
    assert.ok(new Date(unit.createdAt).getTime() > Date.now() - 60_000);
  });

  it('employees never see purchase (cost) prices', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const asEmployee = await api('GET', `/products/units/${unit._id}`, undefined, employee.token);
    assert.equal(asEmployee.status, 200);
    assert.equal(asEmployee.body.unit.purchasePriceCents, undefined);
    const asOwner = await api('GET', `/products/units/${unit._id}`, undefined, owner.token);
    assert.equal(asOwner.body.unit.purchasePriceCents, 20000000);
    const list = await api('GET', '/products/units?limit=100', undefined, employee.token);
    assert.ok(list.body.items.every(u => !('purchasePriceCents' in u)));
    const summary = await api('GET', '/products/stock-summary', undefined, employee.token);
    assert.equal(summary.body.summary.availablePurchaseValueCents, undefined);
  });

  it('employees cannot edit or delete units', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    assert.equal((await api('PATCH', `/products/units/${unit._id}`, { purchasePrice: 1 }, employee.token)).status, 403);
    assert.equal((await api('DELETE', `/products/units/${unit._id}`, { reason: 'x' }, employee.token)).status, 403);
  });

  it('employees can search by serial number', async () => {
    const s = serial('FIND');
    await addUnits(owner.token, [s]);
    const res = await api('GET', `/products/units/by-serial/${encodeURIComponent(s.toLowerCase())}`, undefined, employee.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.unit.serialNumber, s);
    const listed = await api('GET', `/products/units?search=${s.slice(5)}`, undefined, employee.token);
    assert.equal(listed.body.total, 1);
  });
});

describe('owner corrections (audit-logged)', () => {
  it('owner corrects a serial number and prices; the change is in the audit log', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const fixed = serial('FIX');
    const res = await api('PATCH', `/products/units/${unit._id}`, { serialNumber: fixed, sellingPrice: 260000, reason: 'Typo' }, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.unit.serialNumber, fixed);
    const log = await mongoose.model('AuditLog').findOne({ entityId: unit._id, action: 'INVENTORY_UNIT_UPDATED' }).lean();
    assert.ok(log);
    assert.equal(log.reason, 'Typo');
    assert.equal(log.before.sellingPriceCents, 25000000);
    assert.equal(log.after.sellingPriceCents, 26000000);
  });

  it('owner deletes an unsold unit with a reason; a sold unit cannot be deleted', async () => {
    const [unit, soldUnit] = await addUnits(owner.token, [serial(), serial()]);
    assert.equal((await api('DELETE', `/products/units/${unit._id}`, {}, owner.token)).status, 400, 'reason required');
    assert.equal((await api('DELETE', `/products/units/${unit._id}`, { reason: 'Added twice' }, owner.token)).status, 204);
    assert.ok(await mongoose.model('AuditLog').exists({ entityId: unit._id, action: 'INVENTORY_UNIT_DELETED' }));
    await api('POST', '/sales/full-price', { unitId: soldUnit._id, salePrice: 250000 }, owner.token);
    const res = await api('DELETE', `/products/units/${soldUnit._id}`, { reason: 'x' }, owner.token);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'UNIT_SOLD');
  });
});

describe('shop data isolation', () => {
  it('another shop cannot read, find, edit or delete this shop’s units', async () => {
    const s = serial('ISO');
    const [unit] = await addUnits(owner.token, [s]);
    assert.equal((await api('GET', `/products/units/${unit._id}`, undefined, otherShop.token)).status, 404);
    assert.equal((await api('GET', `/products/units/by-serial/${s}`, undefined, otherShop.token)).status, 404);
    assert.equal((await api('PATCH', `/products/units/${unit._id}`, { sellingPrice: 1 }, otherShop.token)).status, 404);
    assert.equal((await api('DELETE', `/products/units/${unit._id}`, { reason: 'x' }, otherShop.token)).status, 404);
    const list = await api('GET', '/products/units?limit=100', undefined, otherShop.token);
    assert.ok(list.body.items.every(u => u._id !== unit._id));
  });

  it('the same serial number may exist in two different shops', async () => {
    const s = serial('BOTH');
    await addUnits(owner.token, [s]);
    const res = await api('POST', '/products', { ...productInput(), serialNumbers: [s] }, otherShop.token);
    assert.equal(res.status, 201);
  });

  it('a shopId in the request body is ignored; the token decides the shop', async () => {
    const res = await api('POST', '/products', { ...productInput(), shopId: owner.shop.id, serialNumbers: [serial()] }, otherShop.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.units[0].shopId, otherShop.shop.id);
  });

  it('requires a login', async () => {
    assert.equal((await api('GET', '/products/units')).status, 401);
    assert.equal((await api('POST', '/products', { ...productInput(), serialNumbers: [serial()] })).status, 401);
  });
});
