import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { addUnits, api, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

let owner, ayesha, bilal, otherShop;
before(async () => {
  await startApi();
  owner = await newShop('Sales Shop');
  ayesha = await newEmployee(owner, 'Ayesha');
  bilal = await newEmployee(owner, 'Bilal');
  otherShop = await newShop('Other Shop');
});
after(stopApi);

const installmentBody = (unitId, overrides = {}) => ({
  unitId, totalPrice: 1200, downPayment: 200, installmentCount: 5, frequency: 'MONTHLY',
  customer: { name: 'Kashif', phone: '+92 333 1112223' }, paymentMethod: 'CASH', ...overrides
});

describe('full-price sales', () => {
  it('sells a unit: sale recorded with serial, seller and server time; unit becomes SOLD_FULL_PRICE', async () => {
    const s = serial('FP');
    const [unit] = await addUnits(owner.token, [s]);
    const before = Date.now();
    const res = await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 240000, paymentMethod: 'CARD', soldAt: '2000-01-01', customer: { name: 'Ali' } }, ayesha.token);
    assert.equal(res.status, 201);
    const sale = res.body.sale;
    assert.equal(sale.type, 'FULL_PRICE');
    assert.equal(sale.item.serialNumber, s);
    assert.equal(sale.salePriceCents, 24000000);
    assert.equal(sale.discountCents, 1000000, 'discount = selling price − sale price');
    assert.equal(sale.soldBy.employeeId, ayesha.employee.employeeId);
    assert.ok(new Date(sale.soldAt).getTime() >= before - 1000, 'client-sent soldAt ignored');
    assert.equal(sale.item.purchasePriceCents, undefined, 'cost hidden from employee');
    const unitNow = await api('GET', `/products/units/${unit._id}`, undefined, owner.token);
    assert.equal(unitNow.body.unit.status, 'SOLD_FULL_PRICE');
    assert.equal(unitNow.body.sale.saleNumber, sale.saleNumber);
    const available = await api('GET', `/products/units?status=AVAILABLE&search=${s}`, undefined, owner.token);
    assert.equal(available.body.total, 0, 'no longer listed as available');
  });

  it('cannot sell the same unit twice', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    assert.equal((await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }, owner.token)).status, 201);
    const again = await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }, ayesha.token);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_SOLD');
    const asInstallment = await api('POST', '/sales/installment', installmentBody(unit._id), ayesha.token);
    assert.equal(asInstallment.body.code, 'ALREADY_SOLD');
  });

  it('concurrent attempts to sell one unit: exactly one succeeds', async () => {
    const [unit] = await addUnits(owner.token, [serial('RACE')]);
    const attempts = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      i % 2 ? api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 100 }, i % 3 ? ayesha.token : bilal.token)
        : api('POST', '/sales/installment', installmentBody(unit._id), owner.token)));
    assert.equal(attempts.filter(r => r.status === 201).length, 1, attempts.map(r => r.status).join(','));
    assert.ok(attempts.filter(r => r.status !== 201).every(r => r.status === 409));
    assert.equal(await mongoose.model('Sale').countDocuments({ unitId: unit._id }), 1);
  });

  it('validates input', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const bad = [{ unitId: 'nope', salePrice: 1 }, { unitId: unit._id }, { unitId: unit._id, salePrice: -5 }, { unitId: unit._id, salePrice: 5, paymentMethod: 'BITCOIN' }];
    for (const body of bad) assert.equal((await api('POST', '/sales/full-price', body, owner.token)).status, 400, JSON.stringify(body));
  });
});

describe('installment sales', () => {
  it('creates the sale, agreement, schedule and down payment; unit becomes SOLD_INSTALLMENT', async () => {
    const [unit] = await addUnits(owner.token, [serial('INST')]);
    const res = await api('POST', '/sales/installment', installmentBody(unit._id), bilal.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { sale, agreement, payments } = res.body;
    assert.equal(sale.type, 'INSTALLMENT');
    assert.equal(agreement.totalPriceCents, 120000);
    assert.equal(agreement.financedCents, 100000);
    assert.equal(agreement.balanceCents, 100000);
    assert.equal(agreement.collectedCents, 20000, 'down payment counted once');
    assert.deepEqual(agreement.schedule.map(e => e.amountCents), [20000, 20000, 20000, 20000, 20000]);
    assert.equal(agreement.status, 'ACTIVE');
    assert.equal(payments.length, 1);
    assert.equal(payments[0].kind, 'DOWN_PAYMENT');
    const unitNow = await api('GET', `/products/units/${unit._id}`, undefined, owner.token);
    assert.equal(unitNow.body.unit.status, 'SOLD_INSTALLMENT');
  });

  it('uneven amounts: the last installment absorbs the rounding', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const res = await api('POST', '/sales/installment', installmentBody(unit._id, { totalPrice: 1000, downPayment: 0, installmentCount: 3 }), owner.token);
    const amounts = res.body.agreement.schedule.map(e => e.amountCents);
    assert.deepEqual(amounts, [33333, 33333, 33334]);
    assert.equal(amounts.reduce((a, b) => a + b), 100000);
  });

  it('weekly and custom frequencies space the due dates correctly', async () => {
    const [u1, u2] = await addUnits(owner.token, [serial(), serial()]);
    const firstDueDate = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    const weekly = await api('POST', '/sales/installment', installmentBody(u1._id, { frequency: 'WEEKLY', installmentCount: 3, firstDueDate }), owner.token);
    const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
    const w = weekly.body.agreement.schedule;
    assert.equal(w[0].dueDate, firstDueDate);
    assert.equal(days(w[0].dueDate, w[1].dueDate), 7);
    const custom = await api('POST', '/sales/installment', installmentBody(u2._id, { frequency: 'CUSTOM', intervalDays: 10, installmentCount: 3, firstDueDate }), owner.token);
    const c = custom.body.agreement.schedule;
    assert.equal(days(c[0].dueDate, c[2].dueDate), 20);
  });

  it('validates the plan', async () => {
    const [unit] = await addUnits(owner.token, [serial()]);
    const bad = [
      installmentBody(unit._id, { downPayment: 1200 }),
      installmentBody(unit._id, { installmentCount: 0 }),
      installmentBody(unit._id, { customer: { name: '', phone: '1' } }),
      installmentBody(unit._id, { frequency: 'CUSTOM' }),
      installmentBody(unit._id, { firstDueDate: '2020-01-01' }),
      installmentBody(unit._id, { totalPrice: 10.005 })
    ];
    for (const body of bad) assert.equal((await api('POST', '/sales/installment', body, owner.token)).status, 400, JSON.stringify(body));
  });

  it('a unit with a placeholder serial (migrated stock) cannot be sold until corrected', async () => {
    const [unit] = await addUnits(owner.token, [serial('LEGACY')]);
    await mongoose.model('InventoryUnit').updateOne({ _id: unit._id }, { $set: { serialPending: true } });
    const res = await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }, owner.token);
    assert.equal(res.body.code, 'SERIAL_PENDING');
    await api('PATCH', `/products/units/${unit._id}`, { serialNumber: serial('REAL') }, owner.token);
    assert.equal((await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }, owner.token)).status, 201);
  });
});

describe('installment payments', () => {
  let agreement;
  before(async () => {
    const [unit] = await addUnits(owner.token, [serial('PAY')]);
    agreement = (await api('POST', '/sales/installment', installmentBody(unit._id), ayesha.token)).body.agreement;
  });

  it('only the owner records payments; employees are read-only', async () => {
    const res = await api('POST', `/installments/${agreement._id}/payments`, { amount: 200 }, ayesha.token);
    assert.equal(res.status, 403);
    const read = await api('GET', `/installments/${agreement._id}`, undefined, ayesha.token);
    assert.equal(read.status, 200, 'the selling employee can read it');
  });

  it('records a payment with amount, date and collector; next due moves on', async () => {
    const res = await api('POST', `/installments/${agreement._id}/payments`, { amount: 300, method: 'BANK_TRANSFER', note: 'Bank' }, owner.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.payment.amountCents, 30000);
    assert.equal(res.body.payment.recordedBy.type, 'owner');
    assert.ok(res.body.payment.paidAt);
    assert.equal(res.body.agreement.balanceCents, 70000);
    assert.equal(res.body.agreement.nextDueCents, 10000, '300 paid = 1½ installments, 100 left on the 2nd');
    const payments = await api('GET', `/installments/${agreement._id}/payments`, undefined, owner.token);
    assert.deepEqual(payments.body.items.map(p => p.kind), ['DOWN_PAYMENT', 'INSTALLMENT']);
  });

  it('cannot overpay, even with concurrent requests', async () => {
    assert.equal((await api('POST', `/installments/${agreement._id}/payments`, { amount: 701 }, owner.token)).body.code, 'OVERPAYMENT');
    const results = await Promise.all(Array.from({ length: 5 }, () => api('POST', `/installments/${agreement._id}/payments`, { amount: 400 }, owner.token)));
    assert.equal(results.filter(r => r.status === 201).length, 1, results.map(r => r.status).join(','));
    const final = await api('POST', `/installments/${agreement._id}/payments`, { amount: 300 }, owner.token);
    assert.equal(final.body.agreement.status, 'COMPLETED');
    assert.equal(final.body.agreement.balanceCents, 0);
    assert.equal((await api('POST', `/installments/${agreement._id}/payments`, { amount: 1 }, owner.token)).body.code, 'AGREEMENT_COMPLETED');
  });
});

describe('who can see which sales', () => {
  let ayeshaSale, bilalSale;
  before(async () => {
    const [u1, u2] = await addUnits(owner.token, [serial('VIS'), serial('VIS')]);
    ayeshaSale = (await api('POST', '/sales/full-price', { unitId: u1._id, salePrice: 100 }, ayesha.token)).body.sale;
    bilalSale = (await api('POST', '/sales/full-price', { unitId: u2._id, salePrice: 100 }, bilal.token)).body.sale;
  });

  it('employees see only their own sales, whatever filters they send', async () => {
    const list = await api('GET', `/sales/full-price?limit=100&soldBy=${bilal.employee._id}`, undefined, ayesha.token);
    assert.ok(list.body.items.length > 0);
    assert.ok(list.body.items.every(s => s.soldBy.employeeId === ayesha.employee.employeeId));
    assert.equal((await api('GET', `/sales/${bilalSale._id}`, undefined, ayesha.token)).status, 404);
    const mine = await api('GET', '/sales/my-sales?limit=100', undefined, ayesha.token);
    assert.ok(mine.body.items.some(s => s._id === ayeshaSale._id));
    assert.ok(mine.body.items.every(s => s.soldBy.employeeId === ayesha.employee.employeeId));
    const installments = await api('GET', '/sales/installment?limit=100', undefined, bilal.token);
    assert.ok(installments.body.items.every(a => a.soldBy.employeeId === bilal.employee.employeeId));
  });

  it('the owner sees every sale and can filter by employee', async () => {
    const all = await api('GET', '/sales/full-price?limit=100', undefined, owner.token);
    const sellers = new Set(all.body.items.map(s => s.soldBy.employeeId));
    assert.ok(sellers.has(ayesha.employee.employeeId) && sellers.has(bilal.employee.employeeId));
    const onlyBilal = await api('GET', `/sales/full-price?limit=100&soldBy=${bilal.employee._id}`, undefined, owner.token);
    assert.ok(onlyBilal.body.items.length && onlyBilal.body.items.every(s => s.soldBy.employeeId === bilal.employee.employeeId));
    assert.ok(all.body.items.every(s => typeof s.item.purchasePriceCents === 'number' || s.item.purchasePriceCents === null));
  });

  it('combined history (GET /sales): owner sees all kinds and sellers, employee only their own', async () => {
    const all = await api('GET', '/sales?limit=100', undefined, owner.token);
    assert.ok(new Set(all.body.items.map(s => s.type)).size === 2, 'both full-price and installment');
    assert.ok(all.body.items.some(s => s.soldBy.employeeId === bilal.employee.employeeId));
    const installmentOnly = await api('GET', '/sales?type=INSTALLMENT&limit=100', undefined, owner.token);
    assert.ok(installmentOnly.body.items.every(s => s.type === 'INSTALLMENT' && s.agreement));
    const ayeshas = await api('GET', `/sales?limit=100&soldBy=${bilal.employee._id}`, undefined, ayesha.token);
    assert.ok(ayeshas.body.items.length && ayeshas.body.items.every(s => s.soldBy.employeeId === ayesha.employee.employeeId));
  });

  it('search by serial number and date range', async () => {
    const res = await api('GET', `/sales/full-price?search=${encodeURIComponent(ayeshaSale.item.serialNumber)}`, undefined, owner.token);
    assert.equal(res.body.total, 1);
    const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    assert.equal((await api('GET', `/sales/full-price?from=${future}`, undefined, owner.token)).body.total, 0);
  });
});

describe('corrections and cancellations (owner only, audit-logged)', () => {
  it('employees cannot cancel or refund; the owner can, with a reason', async () => {
    const [u1, u2] = await addUnits(owner.token, [serial(), serial()]);
    const sale = (await api('POST', '/sales/full-price', { unitId: u1._id, salePrice: 100 }, ayesha.token)).body.sale;
    assert.equal((await api('POST', `/sales/${sale._id}/cancel`, { reason: 'x' }, ayesha.token)).status, 403);
    assert.equal((await api('POST', `/sales/${sale._id}/refund`, {}, owner.token)).status, 400, 'reason required');
    const refunded = await api('POST', `/sales/${sale._id}/refund`, { reason: 'Customer returned it' }, owner.token);
    assert.equal(refunded.body.sale.status, 'REFUNDED');
    assert.ok(await mongoose.model('AuditLog').exists({ entityId: sale._id, action: 'SALE_REFUNDED' }));
    assert.equal((await api('POST', `/sales/${sale._id}/cancel`, { reason: 'again' }, owner.token)).body.code, 'SALE_NOT_COMPLETED');

    const inst = (await api('POST', '/sales/installment', installmentBody(u2._id), ayesha.token)).body;
    const cancelled = await api('POST', `/sales/${inst.sale._id}/cancel`, { reason: 'Customer withdrew' }, owner.token);
    assert.equal(cancelled.body.agreement.status, 'CANCELLED');
    const unitNow = await api('GET', `/products/units/${u2._id}`, undefined, owner.token);
    assert.equal(unitNow.body.unit.status, 'SOLD_INSTALLMENT', 'cancelling does not return the unit to stock');
    assert.equal((await api('POST', `/installments/${inst.agreement._id}/payments`, { amount: 1 }, owner.token)).body.code, 'AGREEMENT_CANCELLED');
  });
});

describe('shop isolation for sales', () => {
  it('another shop cannot sell, view, pay or cancel this shop’s records', async () => {
    const [unit, unit2] = await addUnits(owner.token, [serial(), serial()]);
    assert.equal((await api('POST', '/sales/full-price', { unitId: unit._id, salePrice: 1 }, otherShop.token)).status, 404);
    const sale = (await api('POST', '/sales/installment', installmentBody(unit2._id), owner.token)).body;
    assert.equal((await api('GET', `/sales/${sale.sale._id}`, undefined, otherShop.token)).status, 404);
    assert.equal((await api('GET', `/installments/${sale.agreement._id}`, undefined, otherShop.token)).status, 404);
    assert.equal((await api('POST', `/installments/${sale.agreement._id}/payments`, { amount: 1 }, otherShop.token)).status, 404);
    assert.equal((await api('POST', `/sales/${sale.sale._id}/cancel`, { reason: 'x' }, otherShop.token)).status, 404);
    const list = await api('GET', '/sales/installment?limit=100', undefined, otherShop.token);
    assert.equal(list.body.total, 0);
  });
});
