import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addUnits, api, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

let owner, ayesha, bilal;
before(async () => {
  await startApi();
  owner = await newShop('Dashboard Shop');
  ayesha = await newEmployee(owner, 'Ayesha');
  bilal = await newEmployee(owner, 'Bilal');
  // Stock: 4 units at Rs 1,000 (cost Rs 800). Ayesha adds 1 more.
  const units = await addUnits(owner.token, [serial(), serial(), serial(), serial()], { sellingPrice: 1000, purchasePrice: 800 });
  await addUnits(ayesha.token, [serial()], { sellingPrice: 1000, purchasePrice: 800 });
  // Ayesha: full price Rs 900. Bilal: installment Rs 1,200 (down 200, 5 × 200), owner collects 200.
  await api('POST', '/sales/full-price', { unitId: units[0]._id, salePrice: 900 }, ayesha.token);
  const inst = await api('POST', '/sales/installment', {
    unitId: units[1]._id, totalPrice: 1200, downPayment: 200, installmentCount: 5,
    customer: { name: 'Kashif', phone: '1' }
  }, bilal.token);
  await api('POST', `/installments/${inst.body.agreement._id}/payments`, { amount: 200 }, owner.token);
});
after(stopApi);

describe('partner dashboard', () => {
  it('summary figures come from the records and keep stock, sales, collected and owed apart', async () => {
    const { body: { summary } } = await api('GET', '/dashboard/partner/summary', undefined, owner.token);
    assert.equal(summary.stock.total, 5);
    assert.equal(summary.stock.available, 3);
    assert.equal(summary.stock.soldFullPrice, 1);
    assert.equal(summary.stock.soldInstallment, 1);
    assert.equal(summary.stock.availableSellingValueCents, 300000);
    assert.equal(summary.stock.availablePurchaseValueCents, 240000);
    assert.equal(summary.sales.fullPriceRevenueCents, 90000);
    assert.equal(summary.sales.installmentValueCents, 120000);
    assert.equal(summary.sales.totalValueCents, 210000);
    assert.equal(summary.sales.todayCount, 2);
    assert.equal(summary.collected.downPaymentsCents, 20000);
    assert.equal(summary.collected.installmentPaymentsCents, 20000);
    assert.equal(summary.collected.totalCents, 90000 + 20000 + 20000, 'down payment counted once');
    assert.equal(summary.installments.outstandingCents, 80000);
    assert.equal(summary.installments.active, 1);
    assert.equal(summary.timezone, 'Asia/Karachi');
  });

  it('full-price stats with per-employee figures and daily series', async () => {
    const { body: { stats } } = await api('GET', '/dashboard/partner/full-price-sales', undefined, owner.token);
    assert.equal(stats.totals.count, 1);
    assert.equal(stats.totals.todayCents, 90000);
    assert.equal(stats.totals.monthCents, 90000);
    const a = stats.byEmployee.find(e => e.employeeId === ayesha.employee.employeeId);
    assert.equal(a.count, 1);
    assert.equal(a.valueCents, 90000);
    assert.equal(stats.series.daily.at(-1).valueCents, 90000);
  });

  it('installment stats', async () => {
    const { body: { stats } } = await api('GET', '/dashboard/partner/installment-sales', undefined, owner.token);
    assert.equal(stats.totalSalesValueCents, 120000);
    assert.equal(stats.downPaymentsCollectedCents, 20000);
    assert.equal(stats.installmentPaymentsCollectedCents, 20000);
    assert.equal(stats.totalCollectedCents, 40000);
    assert.equal(stats.outstandingCents, 80000);
    assert.equal(stats.activeAgreements, 1);
    assert.equal(stats.overdueAgreements, 0);
  });

  it('employee performance', async () => {
    const { body: { items } } = await api('GET', '/dashboard/partner/employees', undefined, owner.token);
    const a = items.find(e => e.employeeId === ayesha.employee.employeeId);
    const b = items.find(e => e.employeeId === bilal.employee.employeeId);
    assert.equal(a.unitsAdded, 1);
    assert.equal(a.fullPriceCount, 1);
    assert.equal(b.installmentCount, 1);
    assert.equal(b.installmentCents, 120000);
  });

  it('is owner-only', async () => {
    for (const path of ['summary', 'inventory', 'full-price-sales', 'installment-sales', 'employees']) {
      assert.equal((await api('GET', `/dashboard/partner/${path}`, undefined, ayesha.token)).status, 403, path);
    }
  });
});

describe('employee dashboard', () => {
  it('shows only the employee’s own figures', async () => {
    const { body: { summary } } = await api('GET', '/dashboard/employee/summary', undefined, ayesha.token);
    assert.equal(summary.unitsAdded, 1);
    assert.equal(summary.fullPriceCount, 1);
    assert.equal(summary.installmentCount, 0);
    assert.equal(summary.totalSalesCents, 90000);
    assert.equal(summary.todaySalesCents, 90000);
    const bilals = (await api('GET', '/dashboard/employee/summary', undefined, bilal.token)).body.summary;
    assert.equal(bilals.installmentCount, 1);
    assert.equal(bilals.installments.outstandingCents, 80000);
    const mine = await api('GET', '/dashboard/employee/my-sales', undefined, bilal.token);
    assert.equal(mine.body.total, 1);
    assert.equal(mine.body.items[0].agreement.balanceCents, 80000);
  });

  it('is employee-only', async () => {
    assert.equal((await api('GET', '/dashboard/employee/summary', undefined, owner.token)).status, 403);
  });
});

describe('CSV export', () => {
  it('owner downloads full-price and installment CSVs; employees cannot', async () => {
    const csv = await api('GET', '/sales/full-price/export', undefined, owner.token);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const lines = csv.body.replace(/^﻿/, '').split('\r\n');
    assert.match(lines[0], /^Sale number,Date \(Asia\/Karachi\),Time,Product/);
    assert.equal(lines.length, 2);
    const inst = await api('GET', '/sales/installment/export', undefined, owner.token);
    assert.match(inst.body, /IA-000001/);
    assert.equal((await api('GET', '/sales/full-price/export', undefined, ayesha.token)).status, 403);
  });
});
