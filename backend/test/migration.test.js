import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { api, newShop, startApi, stopApi } from './helpers.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/migrate-serialized-inventory.js', import.meta.url));
const TEST_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/bizora_pilot_test';
const migrate = () => run(process.execPath, [script], { env: { ...process.env, MONGO_URI: TEST_URI } });

let owner, itemId;
before(async () => {
  await startApi();
  owner = await newShop('Legacy Shop');
  const db = mongoose.connection.db;
  const shopId = new mongoose.Types.ObjectId(owner.shop.id);
  const actor = { type: 'owner', id: shopId, name: 'Shop owner', employeeId: '' };
  itemId = new mongoose.Types.ObjectId();
  await db.collection('inventoryitems').insertMany([
    { _id: itemId, shopId, name: 'Iphone 16', sku: '', category: 'Phones', quantity: 3, price: 999, description: '', createdAt: new Date('2026-11-01') },
    { shopId, name: 'Old charger', sku: 'CH-1', category: '', quantity: 0, price: 5, description: '', createdAt: new Date('2026-11-02') }
  ]);
  const createdAt = new Date('2026-11-05T09:00:00Z');
  await db.collection('sales').insertMany([
    { shopId, saleNumber: 'S-000001', item: { inventoryItemId: itemId, name: 'Iphone 16', sku: '', unitPriceCents: 99900 }, quantity: 1, totalCents: 99900, type: 'full',
      customer: { name: '', phone: '' }, payments: [{ kind: 'full', amountCents: 99900, paidAt: createdAt, recordedBy: actor }], paidCents: 99900, balanceCents: 0, status: 'paid', note: '', soldBy: actor, createdAt },
    { shopId, saleNumber: 'S-000002', item: { inventoryItemId: itemId, name: 'Iphone 16', sku: '', unitPriceCents: 99900 }, quantity: 1, totalCents: 99900, type: 'installment',
      customer: { name: 'Kashif', phone: '1' }, installment: { downPaymentCents: 9900, count: 3, schedule: [
        { dueDate: new Date('2026-12-04T19:00:00Z'), amountCents: 30000 }, { dueDate: new Date('2027-01-04T19:00:00Z'), amountCents: 30000 }, { dueDate: new Date('2027-02-04T19:00:00Z'), amountCents: 30000 }] },
      payments: [{ kind: 'down-payment', amountCents: 9900, paidAt: createdAt, recordedBy: actor }, { kind: 'installment', amountCents: 30000, paidAt: createdAt, recordedBy: actor }],
      paidCents: 39900, balanceCents: 60000, status: 'open', note: '', soldBy: actor, createdAt }
  ]);
  await db.collection('shops').updateOne({ _id: shopId }, { $set: { saleSeq: 2 } });
});
after(stopApi);

describe('serialized-inventory migration', () => {
  it('turns old stock into units with placeholder serials and copies old sales', async () => {
    const { stdout } = await migrate();
    assert.match(stdout, /"products":2,"units":3,"sales":2,"agreements":1,"payments":2/);

    const units = await api('GET', '/products/units?limit=100', undefined, owner.token);
    assert.equal(units.body.total, 3);
    assert.ok(units.body.items.every(u => u.serialPending && /^LEGACY-P-\d{4}-00\d$/.test(u.serialNumber) && u.purchasePriceCents === null));
    assert.equal(units.body.items[0].sellingPriceCents, 99900);

    const sold = await api('POST', '/sales/full-price', { unitId: units.body.items[0]._id, salePrice: 999 }, owner.token);
    assert.equal(sold.body.code, 'SERIAL_PENDING', 'placeholder serials block selling');

    const fullPrice = await api('GET', '/sales/full-price', undefined, owner.token);
    assert.equal(fullPrice.body.items[0].saleNumber, 'S-000001');
    assert.equal(fullPrice.body.items[0].legacy.quantity, 1);
    const installments = await api('GET', '/sales/installment', undefined, owner.token);
    const agreement = installments.body.items[0];
    assert.equal(agreement.collectedCents, 39900);
    assert.equal(agreement.balanceCents, 60000);
    assert.equal(agreement.schedule[0].dueDate, '2026-12-05', 'due dates converted to Karachi calendar dates');
    assert.equal(agreement.nextDueDate, '2027-01-05');

    // New sales continue the numbering.
    const fix = await api('PATCH', `/products/units/${units.body.items[0]._id}`, { serialNumber: 'IMEI-356789' }, owner.token);
    assert.equal(fix.status, 200);
    const sale = await api('POST', '/sales/full-price', { unitId: units.body.items[0]._id, salePrice: 999 }, owner.token);
    assert.equal(sale.body.sale.saleNumber, 'S-000003');
  });

  it('leaves the old collections untouched and is safe to run again', async () => {
    assert.equal(await mongoose.connection.db.collection('inventoryitems').countDocuments(), 2);
    assert.equal((await mongoose.connection.db.collection('inventoryitems').findOne({ _id: itemId })).quantity, 3);
    const { stdout } = await migrate();
    assert.match(stdout, /"products":0,"units":0,"sales":0/);
    assert.equal(await mongoose.model('InventoryUnit').countDocuments(), 3);
  });
});
