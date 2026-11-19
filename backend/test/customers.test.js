import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addUnits, api, newEmployee, newShop, serial, startApi, stopApi } from './helpers.js';

// Customer records (services/customerService.js): details, CNIC pictures, and the link to sales.

// A 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let owner, employee, other;
before(async () => {
  await startApi();
  owner = await newShop('Customer Shop');
  employee = await newEmployee(owner, 'Ayesha');
  other = await newShop('Other Shop');
});
after(stopApi);

describe('customer records', () => {
  it('owner and employee can create customers; CNIC is normalised and must be 13 digits', async () => {
    const created = await api('POST', '/customers', { name: 'Kashif Khan', phone: '0301-1234567', cnic: '35202-1234567-1', address: 'Model Town, Lahore' }, employee.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.customer.customerCode, 'C-0001');
    assert.equal(created.body.customer.cnic, '3520212345671');
    assert.equal(created.body.customer.cnicFormatted, '35202-1234567-1');
    assert.equal(created.body.customer.createdBy.type, 'employee');

    const bad = await api('POST', '/customers', { name: 'X', phone: '1', cnic: '12345' }, owner.token);
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /13 digits/);
    const missing = await api('POST', '/customers', { name: '', phone: '1' }, owner.token);
    assert.equal(missing.status, 400);
    assert.equal(missing.body.message, 'Customer name is required');
  });

  it('the same CNIC cannot be used twice in a shop, but can in another shop', async () => {
    const dup = await api('POST', '/customers', { name: 'Someone Else', phone: '0300 0000000', cnic: '3520212345671' }, owner.token);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'DUPLICATE_CNIC');
    assert.equal(dup.body.details.customerCode, 'C-0001');
    const elsewhere = await api('POST', '/customers', { name: 'Same CNIC Other Shop', phone: '1', cnic: '35202-1234567-1' }, other.token);
    assert.equal(elsewhere.status, 201);
  });

  it('lists and searches by name, phone digits, CNIC and code', async () => {
    await api('POST', '/customers', { name: 'Bilal Ahmed', phone: '+92 321 9876543' }, owner.token);
    const byPhone = await api('GET', '/customers?search=3219876', undefined, employee.token);
    assert.equal(byPhone.body.total, 1);
    assert.equal(byPhone.body.items[0].name, 'Bilal Ahmed');
    const byCnic = await api('GET', '/customers?search=3520212345671', undefined, owner.token);
    assert.equal(byCnic.body.items[0].name, 'Kashif Khan');
    const byCode = await api('GET', '/customers?search=C-0002', undefined, owner.token);
    assert.equal(byCode.body.items[0].name, 'Bilal Ahmed');
    const all = await api('GET', '/customers?sort=name&order=asc', undefined, owner.token);
    assert.deepEqual(all.body.items.map(c => c.name), ['Bilal Ahmed', 'Kashif Khan']);
    assert.equal((await api('GET', '/customers', undefined, other.token)).body.total, 1, 'shop isolation');
  });

  it('updates details (audit-logged) and refuses a CNIC another customer has', async () => {
    const list = await api('GET', '/customers?search=Bilal', undefined, owner.token);
    const bilal = list.body.items[0];
    const updated = await api('PATCH', `/customers/${bilal._id}`, { address: 'Gulberg', cnic: '42101-9999999-9' }, employee.token);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.customer.address, 'Gulberg');
    assert.equal(updated.body.customer.cnicFormatted, '42101-9999999-9');
    assert.equal(updated.body.customer.name, 'Bilal Ahmed', 'untouched fields stay');
    const clash = await api('PATCH', `/customers/${bilal._id}`, { cnic: '3520212345671' }, owner.token);
    assert.equal(clash.status, 409);
    assert.equal((await api('PATCH', `/customers/${bilal._id}`, { name: 'Nope' }, other.token)).status, 404, 'another shop sees nothing');
  });
});

describe('ID pictures', () => {
  let kashif;
  before(async () => { kashif = (await api('GET', '/customers?search=Kashif', undefined, owner.token)).body.items[0]; });

  it('uploads, lists, fetches and deletes pictures; rejects non-images and too many', async () => {
    const front = await api('POST', `/customers/${kashif._id}/documents`, { kind: 'CNIC_FRONT', image: PNG }, employee.token);
    assert.equal(front.status, 201, JSON.stringify(front.body));
    assert.equal(front.body.document.kind, 'CNIC_FRONT');
    assert.equal(front.body.document.contentType, 'image/png');
    assert.ok(front.body.document.size > 0);
    const back = await api('POST', `/customers/${kashif._id}/documents`, { kind: 'CNIC_BACK', image: PNG }, owner.token);
    assert.equal(back.status, 201);

    const detail = await api('GET', `/customers/${kashif._id}`, undefined, employee.token);
    assert.equal(detail.body.customer.documents.length, 2);
    assert.equal(detail.body.customer.documents[0].dataUrl, undefined, 'bytes are not in the listing');

    const picture = await api('GET', `/customers/${kashif._id}/documents/${front.body.document._id}`, undefined, employee.token);
    assert.equal(picture.status, 200);
    assert.equal(picture.body.document.dataUrl, PNG);
    assert.equal((await api('GET', `/customers/${kashif._id}/documents/${front.body.document._id}`, undefined, other.token)).status, 404);

    assert.equal((await api('POST', `/customers/${kashif._id}/documents`, { kind: 'OTHER', image: 'data:text/plain;base64,aGVsbG8=' }, owner.token)).status, 400);
    assert.equal((await api('POST', `/customers/${kashif._id}/documents`, { kind: 'WRONG', image: PNG }, owner.token)).status, 400);
    await api('POST', `/customers/${kashif._id}/documents`, { kind: 'OTHER', image: PNG }, owner.token);
    await api('POST', `/customers/${kashif._id}/documents`, { kind: 'OTHER', image: PNG }, owner.token);
    const fifth = await api('POST', `/customers/${kashif._id}/documents`, { kind: 'OTHER', image: PNG }, owner.token);
    assert.equal(fifth.status, 409);
    assert.equal(fifth.body.code, 'TOO_MANY_DOCUMENTS');

    const removed = await api('DELETE', `/customers/${kashif._id}/documents/${back.body.document._id}`, undefined, employee.token);
    assert.equal(removed.status, 204);
    assert.equal((await api('GET', `/customers/${kashif._id}`, undefined, owner.token)).body.customer.documents.length, 3);
    assert.equal((await api('GET', `/customers/${kashif._id}/documents/${back.body.document._id}`, undefined, owner.token)).status, 404);
  });
});

describe('customers and sales', () => {
  let kashif, units;
  before(async () => {
    kashif = (await api('GET', '/customers?search=Kashif', undefined, owner.token)).body.items[0];
    units = await addUnits(owner.token, [serial(), serial(), serial(), serial(), serial()], { sellingPrice: 1000, purchasePrice: 800 });
  });

  it('an installment sale for an existing customer links to the record and snapshots their details', async () => {
    const res = await api('POST', '/sales/installment', { unitId: units[0]._id, customerId: kashif._id, totalPrice: 1200, downPayment: 200, installmentCount: 5 }, employee.token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.sale.customerId, kashif._id);
    assert.equal(res.body.agreement.customerId, kashif._id);
    assert.deepEqual(res.body.agreement.customer, { name: 'Kashif Khan', phone: '0301-1234567', address: 'Model Town, Lahore', reference: '35202-1234567-1' });
    assert.equal((await api('POST', '/sales/installment', { unitId: units[1]._id, customerId: '000000000000000000000000', totalPrice: 1200, downPayment: 200, installmentCount: 5 }, owner.token)).status, 404);
  });

  it('inline installment-customer details create a record, and match an existing one by phone or CNIC next time', async () => {
    const first = await api('POST', '/sales/installment', { unitId: units[1]._id, customer: { name: 'Nadia Iqbal', phone: '0333 1112222', address: 'Johar Town', reference: '61101-5555555-5' }, totalPrice: 1000, downPayment: 100, installmentCount: 3 }, owner.token);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.ok(first.body.agreement.customerId);
    const nadia = await api('GET', `/customers/${first.body.agreement.customerId}`, undefined, owner.token);
    assert.equal(nadia.body.customer.name, 'Nadia Iqbal');
    assert.equal(nadia.body.customer.cnicFormatted, '61101-5555555-5', 'a CNIC-shaped reference becomes the CNIC');
    assert.equal(nadia.body.customer.address, 'Johar Town');

    const again = await api('POST', '/sales/installment', { unitId: units[2]._id, customer: { name: 'Nadia Iqbal', phone: '03331112222' }, totalPrice: 500, downPayment: 0, installmentCount: 2 }, employee.token);
    assert.equal(again.body.agreement.customerId, first.body.agreement.customerId, 'matched by phone digits');
    assert.equal((await api('GET', '/customers?search=Nadia', undefined, owner.token)).body.total, 1, 'no duplicate record');
  });

  it('a full-price sale with name and phone gets a record; a walk-in sale does not', async () => {
    const before = (await api('GET', '/customers?search=Bilal', undefined, owner.token)).body;
    assert.equal(before.total, 1);
    // Bilal was saved as "+92 321 9876543"; the counter types the local form.
    const named = await api('POST', '/sales/full-price', { unitId: units[3]._id, salePrice: 900, customer: { name: 'Bilal Ahmed', phone: '0321-9876543' } }, owner.token);
    assert.equal(named.status, 201);
    assert.equal(named.body.sale.customerId, before.items[0]._id, 'matched the existing Bilal by phone');
    assert.equal((await api('GET', '/customers?search=Bilal', undefined, owner.token)).body.total, 1, 'no duplicate record');
    const walkIn = await api('POST', '/sales/full-price', { unitId: units[4]._id, salePrice: 900 }, owner.token);
    assert.equal(walkIn.status, 201);
    assert.equal(walkIn.body.sale.customerId, undefined);
  });

  it('the customer page shows history and totals; employees see only the sales they made', async () => {
    const asOwner = await api('GET', `/customers/${kashif._id}`, undefined, owner.token);
    assert.equal(asOwner.body.stats.salesCount, 1);
    assert.equal(asOwner.body.stats.totalCents, 120000);
    assert.equal(asOwner.body.stats.activeAgreements, 1);
    assert.equal(asOwner.body.stats.outstandingCents, 100000);
    assert.equal(asOwner.body.sales.length, 1);
    assert.equal(asOwner.body.agreements[0].agreementNumber, 'IA-000001');

    const nadiaId = (await api('GET', '/customers?search=Nadia', undefined, owner.token)).body.items[0]._id;
    const asEmployee = await api('GET', `/customers/${nadiaId}`, undefined, employee.token);
    assert.equal(asEmployee.body.sales.length, 1, 'only the sale Ayesha made');
    assert.equal((await api('GET', `/customers/${nadiaId}`, undefined, owner.token)).body.sales.length, 2);
    const filtered = await api('GET', `/sales?customerId=${nadiaId}`, undefined, owner.token);
    assert.equal(filtered.body.total, 2, 'sales lists filter by customer');
  });

  it('only the owner deletes customers, and only those without sales', async () => {
    const spare = await api('POST', '/customers', { name: 'Duplicate Entry', phone: '0000' }, owner.token);
    assert.equal((await api('DELETE', `/customers/${spare.body.customer._id}`, { reason: 'duplicate' }, employee.token)).status, 403);
    assert.equal((await api('DELETE', `/customers/${kashif._id}`, { reason: 'test' }, owner.token)).status, 409);
    assert.equal((await api('DELETE', `/customers/${spare.body.customer._id}`, {}, owner.token)).status, 400, 'reason required');
    assert.equal((await api('DELETE', `/customers/${spare.body.customer._id}`, { reason: 'duplicate' }, owner.token)).status, 204);
    assert.equal((await api('GET', `/customers/${spare.body.customer._id}`, undefined, owner.token)).status, 404);
  });

  it('the partner summary counts customers', async () => {
    const { body } = await api('GET', '/dashboard/partner/summary', undefined, owner.token);
    assert.equal(body.summary.customers.total, 3);
  });
});
