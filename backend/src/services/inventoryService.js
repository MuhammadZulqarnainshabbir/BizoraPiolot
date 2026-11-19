import mongoose from 'mongoose';
import { isKnownCategory } from '../config/productCategories.js';
import { can } from '../config/permissions.js';
import InventoryUnit, { UNIT_STATUSES, serialKey } from '../models/InventoryUnit.js';
import Product, { catalogKey } from '../models/Product.js';
import SaleRecord from '../models/SaleRecord.js';
import { audit } from './audit.js';
import { nextProductCode } from './sequences.js';
import { listPage } from '../utils/listing.js';
import { badRequest, conflict, inTransaction, money, notFound, objectId, oneOf, text } from '../utils/http.js';
import { isYmd, startOfDateInZone, addDays } from '../utils/time.js';

const MAX_SERIALS_PER_REQUEST = 200;

const UNIT_LIST = {
  sortFields: ['createdAt', 'productName', 'sellingPriceCents', 'status'],
  textSortFields: ['productName'],
  searchFields: ['serialNumber', 'serialKey', 'productName', 'brand', 'model', 'productCode'],
  defaultSort: 'createdAt'
};
const PRODUCT_LIST = {
  sortFields: ['updatedAt', 'name', 'brand'],
  textSortFields: ['name', 'brand'],
  searchFields: ['name', 'brand', 'model', 'productCode'],
  defaultSort: 'updatedAt'
};

/** What a user may see of a unit: cost is owner-only. */
export function unitView(unit, actor) {
  const view = { ...unit };
  delete view.serialKey;
  delete view.__v;
  if (!can(actor, 'inventory.viewCost')) delete view.purchasePriceCents;
  return view;
}

function productFields(input) {
  const name = text(input.name, 'Product name', { required: true, max: 120 });
  const brand = text(input.brand, 'Brand', { required: true, max: 60 });
  const model = text(input.model, 'Model', { required: true, max: 80 });
  const category = text(input.category, 'Category', { required: true, max: 80 });
  const subCategory = text(input.subCategory, 'Sub-category', { required: true, max: 80 });
  if (!isKnownCategory(category, subCategory)) throw badRequest('Choose a category and sub-category from the list');
  const description = text(input.description, 'Description', { max: 1000 });
  const imageUrls = input.imageUrls ?? [];
  if (!Array.isArray(imageUrls) || imageUrls.length > 5 || !imageUrls.every(u => typeof u === 'string' && /^https?:\/\/\S{1,490}$/i.test(u.trim()))) {
    throw badRequest('Images must be up to 5 links starting with http:// or https://');
  }
  return { name, brand, model, brandKey: catalogKey(brand), modelKey: catalogKey(model), category, subCategory, description, imageUrls: imageUrls.map(u => u.trim()) };
}

function supplierFields(input = {}) {
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Invalid supplier details');
  return {
    name: text(input.name, 'Supplier name', { max: 120 }),
    phone: text(input.phone, 'Supplier phone', { max: 40 }),
    invoiceRef: text(input.invoiceRef, 'Supplier invoice reference', { max: 60 })
  };
}

function serialList(input) {
  if (!Array.isArray(input) || input.length === 0) throw badRequest('Enter at least one serial number', { field: 'serialNumbers' });
  if (input.length > MAX_SERIALS_PER_REQUEST) throw badRequest(`Add at most ${MAX_SERIALS_PER_REQUEST} units at a time`);
  const seen = new Map();
  const duplicatesInRequest = [];
  const serials = input.map((raw, i) => {
    if (typeof raw !== 'string' || !raw.trim()) throw badRequest(`Serial number ${i + 1} is empty. Every unit needs a serial number.`, { field: 'serialNumbers' });
    const serial = raw.trim();
    if (serial.length > 100) throw badRequest(`Serial number ${i + 1} is longer than 100 characters`);
    const key = serialKey(serial);
    if (seen.has(key)) duplicatesInRequest.push(serial); else seen.set(key, serial);
    return { serial, key };
  });
  if (duplicatesInRequest.length) throw conflict('The same serial number was entered more than once', 'DUPLICATE_SERIAL', { serials: duplicatesInRequest });
  return serials;
}

/**
 * Adds one unit per serial number. The product is identified by `productId`, or by brand + model
 * (reused if it already exists in the catalog, created otherwise). All-or-nothing.
 */
export async function addStock(actor, shopId, body = {}) {
  const serials = serialList(body.serialNumbers);
  const sellingPriceCents = money(body.sellingPrice, 'Selling price');
  const purchasePriceCents = money(body.purchasePrice, 'Purchase price');
  const supplier = supplierFields(body.supplier);
  const productId = body.productId ? objectId(body.productId, 'product ID') : null;
  const fields = productId ? null : productFields(body.product ?? {});

  try {
    return await inTransaction(async (session) => {
      let product = productId
        ? await Product.findOne({ _id: productId, shopId }).session(session)
        : await Product.findOne({ shopId, brandKey: fields.brandKey, modelKey: fields.modelKey }).session(session);
      if (productId && !product) throw notFound('Product not found');
      const createdProduct = !product;
      if (!product) {
        [product] = await Product.create([{ shopId, productCode: await nextProductCode(shopId, session), ...fields, createdBy: actor }], { session });
      }

      const existing = await InventoryUnit.find({ shopId, serialKey: { $in: serials.map(s => s.key) } }).select('serialNumber').session(session).lean();
      if (existing.length) {
        throw conflict('These serial numbers are already in your stock', 'DUPLICATE_SERIAL', { serials: existing.map(u => u.serialNumber) });
      }
      const units = await InventoryUnit.insertMany(serials.map(({ serial, key }) => ({
        shopId, productId: product._id, serialNumber: serial, serialKey: key,
        productCode: product.productCode, productName: product.name, brand: product.brand, model: product.model,
        category: product.category, subCategory: product.subCategory,
        purchasePriceCents, sellingPriceCents, supplier, status: 'AVAILABLE', addedBy: actor
      })), { session });
      return { product: product.toObject(), createdProduct, units: units.map(u => unitView(u.toObject(), actor)) };
    });
  } catch (err) {
    // Lost a race with another request adding the same serial: report it like the pre-check does.
    if (err.code === 11000 && /serialKey/.test(err.message)) throw conflict('One or more serial numbers are already in your stock', 'DUPLICATE_SERIAL');
    throw err;
  }
}

/** Inventory units, paged. Filters: status, productId, addedBy (employee id | 'owner' | 'me'), needsSerial, from/to (added date). */
export async function listUnits(actor, shop, query) {
  const extra = {};
  if (query.status) extra.status = oneOf(query.status, UNIT_STATUSES, 'Status');
  if (query.productId) extra.productId = objectId(query.productId, 'product ID');
  if (query.needsSerial === 'true') extra.serialPending = true;
  if (query.addedBy === 'me') extra['addedBy.id'] = new mongoose.Types.ObjectId(String(actor.id));
  else if (query.addedBy === 'owner') extra['addedBy.type'] = 'owner';
  else if (query.addedBy) extra['addedBy.id'] = objectId(query.addedBy, 'employee');
  const range = dateRange(query, shop.timezone);
  if (range) extra.createdAt = range;
  const { records, ...meta } = await listPage(InventoryUnit, shop._id, query, UNIT_LIST, extra);
  return { items: records.map(u => unitView(u, actor)), ...meta };
}

/** { $gte, $lt } for from/to calendar dates (inclusive) in the shop's timezone, or null. */
export function dateRange(query, tz) {
  const range = {};
  if (query.from) { if (!isYmd(query.from)) throw badRequest('“From” must be a date (YYYY-MM-DD)'); range.$gte = startOfDateInZone(query.from, tz); }
  if (query.to) { if (!isYmd(query.to)) throw badRequest('“To” must be a date (YYYY-MM-DD)'); range.$lt = startOfDateInZone(addDays(query.to, 1), tz); }
  return Object.keys(range).length ? range : null;
}

/** Catalog products with their stock counts. */
export async function listProducts(actor, shopId, query) {
  const { records, ...meta } = await listPage(Product, shopId, query, PRODUCT_LIST);
  const counts = await InventoryUnit.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(String(shopId)), productId: { $in: records.map(p => p._id) } } },
    { $group: { _id: { productId: '$productId', status: '$status' }, n: { $sum: 1 } } }
  ]);
  const byProduct = {};
  for (const { _id, n } of counts) (byProduct[_id.productId] ??= { AVAILABLE: 0, SOLD_FULL_PRICE: 0, SOLD_INSTALLMENT: 0 })[_id.status] = n;
  return { items: records.map(p => ({ ...p, stock: byProduct[p._id] ?? { AVAILABLE: 0, SOLD_FULL_PRICE: 0, SOLD_INSTALLMENT: 0 } })), ...meta };
}

export async function getProduct(actor, shopId, id) {
  const product = await Product.findOne({ _id: objectId(id, 'product ID'), shopId }).lean();
  if (!product) throw notFound('Product not found');
  const units = await InventoryUnit.find({ shopId, productId: product._id }).sort({ createdAt: -1 }).limit(500).lean();
  const stock = { AVAILABLE: 0, SOLD_FULL_PRICE: 0, SOLD_INSTALLMENT: 0 };
  for (const u of units) stock[u.status]++;
  return { product, stock, units: units.map(u => unitView(u, actor)) };
}

export async function getUnit(actor, shopId, id) {
  const unit = await InventoryUnit.findOne({ _id: objectId(id, 'unit ID'), shopId }).lean();
  if (!unit) throw notFound('Inventory unit not found');
  return unitDetails(actor, unit);
}

export async function findBySerial(actor, shopId, serial) {
  const key = serialKey(serial);
  if (!key) throw badRequest('Enter a serial number');
  const unit = await InventoryUnit.findOne({ shopId, serialKey: key }).lean();
  if (!unit) throw notFound('No unit with that serial number in this shop');
  return unitDetails(actor, unit);
}

async function unitDetails(actor, unit) {
  const product = await Product.findById(unit.productId).lean();
  let sale = null;
  if (unit.saleId) {
    const s = await SaleRecord.findById(unit.saleId).select('saleNumber type soldAt soldBy status').lean();
    // Who sold it is shop-internal; employees see it only for their own sales.
    if (s && (can(actor, 'sales.viewAll') || String(s.soldBy.id) === String(actor.id))) sale = s;
    else if (s) sale = { _id: s._id, saleNumber: s.saleNumber, type: s.type, soldAt: s.soldAt, status: s.status, mine: false };
  }
  return { unit: unitView(unit, actor), product, sale };
}

/** Owner correction of an unsold unit: serial number, prices, supplier. Audit-logged. */
export async function updateUnit(actor, shopId, id, body = {}) {
  const reason = text(body.reason, 'Reason', { max: 500 });
  const changes = {};
  if (body.serialNumber !== undefined) {
    const serial = text(body.serialNumber, 'Serial number', { required: true, max: 100 });
    changes.serialNumber = serial; changes.serialKey = serialKey(serial); changes.serialPending = false;
  }
  if (body.sellingPrice !== undefined) changes.sellingPriceCents = money(body.sellingPrice, 'Selling price');
  if (body.purchasePrice !== undefined) changes.purchasePriceCents = money(body.purchasePrice, 'Purchase price');
  if (body.supplier !== undefined) changes.supplier = supplierFields(body.supplier);
  if (!Object.keys(changes).length) throw badRequest('Nothing to change');

  try {
    return await inTransaction(async (session) => {
      const before = await InventoryUnit.findOne({ _id: objectId(id, 'unit ID'), shopId }).session(session).lean();
      if (!before) throw notFound('Inventory unit not found');
      if (before.status !== 'AVAILABLE') throw conflict('Sold units are part of the sales history and can’t be changed', 'UNIT_SOLD');
      if (changes.serialKey && changes.serialKey !== before.serialKey &&
          await InventoryUnit.exists({ shopId, serialKey: changes.serialKey }).session(session)) {
        throw conflict('That serial number is already in your stock', 'DUPLICATE_SERIAL', { serials: [changes.serialNumber] });
      }
      const after = await InventoryUnit.findOneAndUpdate({ _id: before._id, status: 'AVAILABLE' }, { $set: changes }, { new: true, session, lean: true });
      if (!after) throw conflict('This unit was sold while you were editing it', 'UNIT_SOLD');
      await audit(session, {
        shopId, actor, action: 'INVENTORY_UNIT_UPDATED', entityType: 'InventoryUnit', entityId: before._id, reason,
        before: Object.fromEntries(Object.keys(changes).filter(k => k !== 'serialKey').map(k => [k, before[k]])),
        after: Object.fromEntries(Object.keys(changes).filter(k => k !== 'serialKey').map(k => [k, after[k]]))
      });
      return { unit: unitView(after, actor) };
    });
  } catch (err) {
    if (err.code === 11000) throw conflict('That serial number is already in your stock', 'DUPLICATE_SERIAL');
    throw err;
  }
}

/** Owner removal of a unit that was never sold (e.g. added by mistake). Audit-logged with a full copy. */
export async function deleteUnit(actor, shopId, id, body = {}) {
  const reason = text(body.reason, 'Reason', { required: true, max: 500 });
  return inTransaction(async (session) => {
    const unit = await InventoryUnit.findOneAndDelete({ _id: objectId(id, 'unit ID'), shopId, status: 'AVAILABLE' }, { session, lean: true });
    if (!unit) {
      const exists = await InventoryUnit.exists({ _id: id, shopId }).session(session);
      if (!exists) throw notFound('Inventory unit not found');
      throw conflict('Sold units are part of the sales history and can’t be deleted', 'UNIT_SOLD');
    }
    await audit(session, { shopId, actor, action: 'INVENTORY_UNIT_DELETED', entityType: 'InventoryUnit', entityId: unit._id, before: unit, reason });
  });
}

/** Owner edit of catalog details; copied onto the product's units (sales keep their own copies). */
export async function updateProduct(actor, shopId, id, body = {}) {
  const fields = productFields(body);
  try {
    return await inTransaction(async (session) => {
      const before = await Product.findOne({ _id: objectId(id, 'product ID'), shopId }).session(session).lean();
      if (!before) throw notFound('Product not found');
      const after = await Product.findOneAndUpdate({ _id: before._id }, { $set: fields }, { new: true, session, lean: true });
      await InventoryUnit.updateMany({ shopId, productId: before._id }, { $set: {
        productName: after.name, brand: after.brand, model: after.model, category: after.category, subCategory: after.subCategory
      } }, { session });
      const keys = ['name', 'brand', 'model', 'category', 'subCategory', 'description', 'imageUrls'];
      await audit(session, {
        shopId, actor, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: before._id, reason: text(body.reason, 'Reason', { max: 500 }),
        before: Object.fromEntries(keys.map(k => [k, before[k]])), after: Object.fromEntries(keys.map(k => [k, after[k]]))
      });
      return { product: after };
    });
  } catch (err) {
    if (err.code === 11000) throw conflict('Another product already has this brand and model', 'DUPLICATE_PRODUCT');
    throw err;
  }
}

/** Unit counts (everyone) and stock values (owner only). */
export async function stockSummary(actor, shopId) {
  const [row] = await InventoryUnit.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(String(shopId)) } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      available: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, 1, 0] } },
      soldFullPrice: { $sum: { $cond: [{ $eq: ['$status', 'SOLD_FULL_PRICE'] }, 1, 0] } },
      soldInstallment: { $sum: { $cond: [{ $eq: ['$status', 'SOLD_INSTALLMENT'] }, 1, 0] } },
      needsSerial: { $sum: { $cond: ['$serialPending', 1, 0] } },
      availableSellingValueCents: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, '$sellingPriceCents', 0] } },
      availablePurchaseValueCents: { $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, { $ifNull: ['$purchasePriceCents', 0] }, 0] } },
      availableWithoutCost: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'AVAILABLE'] }, { $eq: ['$purchasePriceCents', null] }] }, 1, 0] } }
    } }
  ]);
  const summary = row ?? { total: 0, available: 0, soldFullPrice: 0, soldInstallment: 0, needsSerial: 0, availableSellingValueCents: 0, availablePurchaseValueCents: 0, availableWithoutCost: 0 };
  delete summary._id;
  if (!can(actor, 'inventory.viewCost')) { delete summary.availablePurchaseValueCents; delete summary.availableWithoutCost; }
  return summary;
}
