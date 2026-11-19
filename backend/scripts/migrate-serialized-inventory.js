// One-time migration from quantity-based stock to serialized inventory.
//
//   npm run migrate:inventory            (uses MONGO_URI from .env)
//   npm run migrate:inventory -- --dry-run
//
// For every shop:
//   * each old product (collection `inventoryitems`) becomes a catalog Product (brand "Unbranded",
//     model = old SKU or name) plus one InventoryUnit per unit in stock. Old stock had no serial
//     numbers, so units get placeholder serials (LEGACY-P-0001-001) and are flagged serialPending:
//     they can't be sold until the owner enters the real serial (audit-logged).
//   * each old sale (collection `sales`) is copied to `sale_records` with `legacy` set, keeping its
//     number, seller, customer and dates. Installment sales get an InstallmentAgreement and their
//     payments.
// The old collections are not modified (they stay as a backup). Safe to run again: anything
// already migrated is skipped.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import InstallmentAgreement from '../src/models/InstallmentAgreement.js';
import InstallmentPayment from '../src/models/InstallmentPayment.js';
import InventoryUnit, { serialKey } from '../src/models/InventoryUnit.js';
import LegacyInventoryItem from '../src/models/legacy/LegacyInventoryItem.js';
import LegacySale from '../src/models/legacy/LegacySale.js';
import Product, { catalogKey } from '../src/models/Product.js';
import SaleRecord from '../src/models/SaleRecord.js';
import Shop from '../src/models/Shop.js';
import { nextAgreementNumber, nextProductCode } from '../src/services/sequences.js';
import { dateInZone } from '../src/utils/time.js';

const MIGRATION_ID = '2026-11-serialized-inventory';
const dryRun = process.argv.includes('--dry-run');

await connectDB();
const migrations = mongoose.connection.db.collection('migrations');
const totals = { products: 0, units: 0, sales: 0, agreements: 0, payments: 0, skippedProducts: 0, skippedSales: 0 };

const shops = await Shop.find().lean();
for (const shop of shops) {
  const tz = shop.timezone || 'Asia/Karachi';
  const owner = { type: 'owner', id: shop._id, name: 'Shop owner', employeeId: '' };
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // ---- Products and units
      const productByLegacyId = new Map();
      for (const item of await LegacyInventoryItem.find({ shopId: shop._id }).session(session).lean()) {
        const existing = await Product.findOne({ shopId: shop._id, legacyInventoryItemId: item._id }).session(session).lean();
        if (existing) { productByLegacyId.set(String(item._id), existing); totals.skippedProducts++; continue; }
        let model = (item.sku || item.name).trim();
        if (await Product.exists({ shopId: shop._id, brandKey: catalogKey('Unbranded'), modelKey: catalogKey(model) }).session(session)) {
          model = `${model} (${String(item._id).slice(-6)})`;
        }
        const productCode = await nextProductCode(shop._id, session);
        const [product] = await Product.create([{
          shopId: shop._id, productCode, name: item.name, brand: 'Unbranded', model,
          brandKey: catalogKey('Unbranded'), modelKey: catalogKey(model),
          category: item.category || '', subCategory: item.subCategory || '', description: item.description || '',
          createdBy: owner, legacyInventoryItemId: item._id, createdAt: item.createdAt
        }], { session });
        productByLegacyId.set(String(item._id), product.toObject());
        totals.products++;
        const units = Array.from({ length: Math.max(0, item.quantity || 0) }, (_, i) => {
          const serial = `LEGACY-${productCode}-${String(i + 1).padStart(3, '0')}`;
          return {
            shopId: shop._id, productId: product._id, serialNumber: serial, serialKey: serialKey(serial), serialPending: true,
            productCode, productName: product.name, brand: product.brand, model: product.model,
            category: product.category, subCategory: product.subCategory,
            purchasePriceCents: null, sellingPriceCents: Math.round((item.price || 0) * 100),
            status: 'AVAILABLE', addedBy: owner, createdAt: item.createdAt
          };
        });
        if (units.length) await InventoryUnit.insertMany(units, { session });
        totals.units += units.length;
      }

      // ---- Sales
      for (const old of await LegacySale.find({ shopId: shop._id }).sort({ createdAt: 1 }).session(session).lean()) {
        if (await SaleRecord.exists({ shopId: shop._id, 'legacy.saleId': old._id }).session(session)) { totals.skippedSales++; continue; }
        const product = productByLegacyId.get(String(old.item.inventoryItemId));
        const type = old.type === 'installment' ? 'INSTALLMENT' : 'FULL_PRICE';
        const saleId = new mongoose.Types.ObjectId();
        const actorOf = (a) => ({ type: a.type, id: a.id, name: a.name, employeeId: a.employeeId || '' });
        let agreementId;
        if (type === 'INSTALLMENT' && old.installment?.schedule?.length) {
          agreementId = new mongoose.Types.ObjectId();
          const schedule = old.installment.schedule.map((e, i) => ({ number: i + 1, dueDate: dateInZone(tz, new Date(e.dueDate)), amountCents: e.amountCents }));
          const down = old.installment.downPaymentCents || 0;
          let covered = old.paidCents - down, next = null;
          for (const e of schedule) { if (covered >= e.amountCents) { covered -= e.amountCents; continue; } next = { date: e.dueDate, cents: e.amountCents - Math.max(covered, 0) }; break; }
          await InstallmentAgreement.create([{
            _id: agreementId, shopId: shop._id, agreementNumber: await nextAgreementNumber(shop._id, session), saleId,
            item: { productName: old.item.name, serialNumber: '' }, customer: old.customer || {},
            totalPriceCents: old.totalCents, downPaymentCents: down, financedCents: old.totalCents - down,
            installmentCount: schedule.length, frequency: 'MONTHLY', schedule,
            collectedCents: old.paidCents, balanceCents: old.balanceCents,
            nextDueDate: next?.date ?? null, nextDueCents: next?.cents ?? null,
            status: old.balanceCents === 0 ? 'COMPLETED' : 'ACTIVE', soldBy: actorOf(old.soldBy), notes: old.note || '', createdAt: old.createdAt
          }], { session });
          const payments = (old.payments || []).filter(p => p.kind !== 'full').map(p => ({
            shopId: shop._id, agreementId, saleId, kind: p.kind === 'down-payment' ? 'DOWN_PAYMENT' : 'INSTALLMENT',
            amountCents: p.amountCents, method: 'OTHER', paidAt: p.paidAt, recordedBy: actorOf(p.recordedBy), note: p.note || ''
          }));
          if (payments.length) await InstallmentPayment.insertMany(payments, { session });
          totals.agreements++; totals.payments += payments.length;
        }
        await SaleRecord.create([{
          _id: saleId, shopId: shop._id, saleNumber: old.saleNumber, type, productId: product?._id,
          item: {
            productCode: product?.productCode ?? '', productName: old.item.name, brand: product?.brand ?? '', model: product?.model ?? '',
            category: product?.category ?? '', subCategory: product?.subCategory ?? '', serialNumber: '', serialKey: '',
            listPriceCents: old.item.unitPriceCents, purchasePriceCents: null
          },
          salePriceCents: old.totalCents, discountCents: 0, paymentMethod: 'OTHER',
          customer: old.customer || {}, note: old.note || '', soldBy: actorOf(old.soldBy), soldAt: old.createdAt,
          status: 'COMPLETED', installmentAgreementId: agreementId,
          legacy: { saleId: old._id, quantity: old.quantity }
        }], { session });
        totals.sales++;
      }
      if (dryRun) throw Object.assign(new Error('dry run'), { dryRun: true });
    });
  } catch (err) {
    if (!err.dryRun) throw err;
  } finally {
    await session.endSession();
  }
}

if (!dryRun) await migrations.updateOne({ _id: MIGRATION_ID }, { $set: { appliedAt: new Date(), totals } }, { upsert: true });
console.log(`${dryRun ? '[dry run, nothing saved] ' : ''}Serialized-inventory migration:`, JSON.stringify(totals));
await mongoose.disconnect();
