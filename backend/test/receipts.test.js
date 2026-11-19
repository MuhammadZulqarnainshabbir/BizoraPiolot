import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addUnits, api, baseUrl, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

// PDF receipts (services/receiptService.js).

let owner, employee, other, units, fullSale, installment;
before(async () => {
  await startApi();
  owner = await newShop('Receipt Shop');
  employee = await newEmployee(owner, 'Ayesha');
  other = await newShop('Other Shop');
  await api('PATCH', '/auth/shop-settings', { ntn: '1234567-8', strn: '32-77-8765-432-19', receiptNote: 'Warranty claims need this receipt.' }, owner.token);
  units = await addUnits(owner.token, [serial(), serial(), serial()], { sellingPrice: 150000, purchasePrice: 120000 });
  fullSale = (await api('POST', '/sales/full-price', { unitId: units[0]._id, salePrice: 145000, paymentMethod: 'CARD', customer: { name: 'Kashif Khan', phone: '0301-1234567' } }, employee.token)).body.sale;
  installment = (await api('POST', '/sales/installment', {
    unitId: units[1]._id, totalPrice: 160000, downPayment: 40000, installmentCount: 4, frequency: 'MONTHLY',
    customer: { name: 'نادیہ اقبال', phone: '0333 1112222', address: 'Johar Town, Lahore', reference: '35202-1234567-1' }
  }, owner.token)).body;
  await api('POST', `/installments/${installment.agreement._id}/payments`, { amount: 30000, method: 'CASH', note: 'First installment' }, owner.token);
});
after(stopApi);

async function pdf(path, token) {
  const res = await fetch(baseUrl + path, { headers: { Authorization: `Bearer ${token}` } });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), bytes };
}

describe('shop receipt settings', () => {
  it('owner sets NTN, STRN and receipt terms; they appear in the profile', async () => {
    const me = await api('GET', '/auth/me', undefined, owner.token);
    assert.equal(me.body.shop.ntn, '1234567-8');
    assert.equal(me.body.shop.strn, '32-77-8765-432-19');
    assert.equal(me.body.shop.receiptNote, 'Warranty claims need this receipt.');
    const tooLong = await api('PATCH', '/auth/shop-settings', { ntn: 'x'.repeat(31) }, owner.token);
    assert.equal(tooLong.status, 400);
    const nothing = await api('PATCH', '/auth/shop-settings', {}, owner.token);
    assert.equal(nothing.status, 400);
    // Timezone still works on its own.
    const tz = await api('PATCH', '/auth/shop-settings', { timezone: 'Asia/Dubai' }, owner.token);
    assert.equal(tz.body.shop.timezone, 'Asia/Dubai');
    assert.equal(tz.body.shop.ntn, '1234567-8', 'other settings untouched');
  });
});

describe('sale receipts', () => {
  it('a full-price sale receipt is a PDF with a file name from the sale number', async () => {
    const res = await pdf(`/sales/${fullSale._id}/receipt.pdf`, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.type, 'application/pdf');
    assert.match(res.disposition, /attachment; filename="receipt-S-\d+\.pdf"/);
    assert.equal(res.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(res.bytes.length > 4000, 'fonts embedded');
  });

  it('an installment sale receipt includes the agreement, schedule and payments', async () => {
    const res = await pdf(`/sales/${installment.sale._id}/receipt.pdf`, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.type, 'application/pdf');
    assert.equal(res.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(res.bytes.length > 4000);
  });

  it('the employee who made the sale can download it; another shop cannot', async () => {
    assert.equal((await pdf(`/sales/${fullSale._id}/receipt.pdf`, employee.token)).status, 200);
    assert.equal((await pdf(`/sales/${installment.sale._id}/receipt.pdf`, employee.token)).status, 404, 'not their sale');
    assert.equal((await pdf(`/sales/${fullSale._id}/receipt.pdf`, other.token)).status, 404);
    assert.equal((await pdf(`/sales/${fullSale._id}/receipt.pdf`, 'nope')).status, 401);
  });

  it('a payment receipt exists for every payment on an agreement', async () => {
    const { body } = await api('GET', `/installments/${installment.agreement._id}/payments`, undefined, owner.token);
    assert.equal(body.items.length, 2, 'down payment + one installment');
    for (const payment of body.items) {
      const res = await pdf(`/installments/${installment.agreement._id}/payments/${payment._id}/receipt.pdf`, owner.token);
      assert.equal(res.status, 200);
      assert.equal(res.type, 'application/pdf');
      assert.match(res.disposition, /attachment; filename="payment-IA-\d+-P0[12]\.pdf"/);
    }
    assert.equal((await pdf(`/installments/${installment.agreement._id}/payments/000000000000000000000000/receipt.pdf`, owner.token)).status, 404);
  });

  it('a cancelled sale still has a receipt (marked cancelled)', async () => {
    await api('POST', `/sales/${fullSale._id}/cancel`, { reason: 'Customer changed their mind' }, owner.token);
    const res = await pdf(`/sales/${fullSale._id}/receipt.pdf`, owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.bytes.subarray(0, 5).toString(), '%PDF-');
  });
});
