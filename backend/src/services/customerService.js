import mongoose from 'mongoose';
import { can } from '../config/permissions.js';
import Customer, { DOCUMENT_KINDS } from '../models/Customer.js';
import CustomerDocument from '../models/CustomerDocument.js';
import InstallmentAgreement from '../models/InstallmentAgreement.js';
import SaleRecord from '../models/SaleRecord.js';
import { audit } from './audit.js';
import { agreementView, saleView } from './salesService.js';
import { nextCustomerCode } from './sequences.js';
import { listPage } from '../utils/listing.js';
import { badRequest, conflict, inTransaction, notFound, objectId, oneOf, text } from '../utils/http.js';
import { dateInZone } from '../utils/time.js';

// Customer records: name, phone, CNIC, address and pictures of the ID card, plus the customer's
// purchase history. Both roles may create and edit customers (they're recorded at the counter);
// only the owner may delete one, and only when no sale refers to it.

const CUSTOMER_LIST = {
  sortFields: ['updatedAt', 'createdAt', 'name'],
  textSortFields: ['name'],
  searchFields: ['name', 'phone', 'phoneKey', 'cnic', 'customerCode', 'address'],
  defaultSort: 'updatedAt'
};
const MAX_DOCUMENTS = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HISTORY_LIMIT = 100;

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Digits only: "12345-1234567-1" → "1234512345671". */
export const cnicDigits = (value) => String(value ?? '').replace(/\D/g, '');
/** "1234512345671" → "12345-1234567-1" (anything else is returned as is). */
export const formatCnic = (digits) => digits && digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : digits || '';
/**
 * Phone digits for matching. Pakistani numbers are written "0301-1234567" or "+92 301 1234567";
 * the last 10 digits are the same in both, so that's the key (shorter numbers are used whole).
 */
export const phoneKey = (value) => { const digits = String(value ?? '').replace(/\D/g, ''); return digits.length > 10 ? digits.slice(-10) : digits; };

/** What the API returns for a customer. */
export function customerView(customer) {
  const view = { ...customer };
  delete view.__v;
  delete view.phoneKey;
  view.cnicFormatted = formatCnic(view.cnic);
  view.documents = (view.documents ?? []).map(d => ({ _id: d._id, kind: d.kind, contentType: d.contentType, size: d.size, uploadedBy: d.uploadedBy, createdAt: d.createdAt }));
  return view;
}

function cnicField(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const digits = cnicDigits(value);
  if (digits.length !== 13 || /\D/.test(digits)) throw badRequest('CNIC must be 13 digits (e.g. 12345-1234567-1)', { field: 'cnic' });
  return digits;
}

/** Validated fields from a create/update body. With `partial`, only the fields present are returned. */
function customerFields(input = {}, { partial = false } = {}) {
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Invalid customer details');
  const fields = {};
  const has = (k) => !partial || input[k] !== undefined;
  if (has('name')) fields.name = text(input.name, 'Customer name', { required: true, max: 120 });
  if (has('phone')) { fields.phone = text(input.phone, 'Customer phone', { required: true, max: 40 }); fields.phoneKey = phoneKey(fields.phone); }
  if (has('cnic')) fields.cnic = cnicField(input.cnic);
  if (has('address')) fields.address = text(input.address, 'Customer address', { max: 300 });
  if (has('notes')) fields.notes = text(input.notes, 'Notes', { max: 500 });
  return fields;
}

async function assertCnicFree(shopId, cnic, exceptId, session) {
  if (!cnic) return;
  const clash = await Customer.findOne({ shopId, cnic, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('customerCode name').session(session).lean();
  if (clash) throw conflict('Another customer already has this CNIC', 'DUPLICATE_CNIC', { customerId: clash._id, customerCode: clash.customerCode, name: clash.name });
}

export async function listCustomers(actor, shopId, query) {
  const { records, ...meta } = await listPage(Customer, shopId, query, CUSTOMER_LIST);
  return { items: records.map(customerView), ...meta };
}

export async function createCustomer(actor, shopId, body = {}) {
  const fields = customerFields(body);
  try {
    return await inTransaction(async (session) => {
      await assertCnicFree(shopId, fields.cnic, null, session);
      const [customer] = await Customer.create([{ shopId, customerCode: await nextCustomerCode(shopId, session), ...fields, createdBy: actor }], { session });
      return { customer: customerView(customer.toObject()) };
    });
  } catch (err) {
    if (err.code === 11000 && /cnic/.test(err.message)) throw conflict('Another customer already has this CNIC', 'DUPLICATE_CNIC');
    throw err;
  }
}

/** Only sales the actor may see: the whole shop with sales.viewAll, otherwise their own. */
const scope = (actor) => can(actor, 'sales.viewAll') ? {} : { 'soldBy.id': oid(actor.id) };

/** The customer, their purchase history (as far as the actor may see it) and totals. */
export async function getCustomer(actor, shop, idRaw) {
  const customer = await Customer.findOne({ _id: objectId(idRaw, 'customer ID'), shopId: shop._id }).lean();
  if (!customer) throw notFound('Customer not found');
  const today = dateInZone(shop.timezone);
  const filter = { shopId: shop._id, customerId: customer._id, ...scope(actor) };
  const [sales, agreements] = await Promise.all([
    SaleRecord.find(filter).sort({ soldAt: -1 }).limit(HISTORY_LIMIT).lean(),
    InstallmentAgreement.find(filter).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean()
  ]);
  const views = agreements.map(a => agreementView(a, today));
  const stats = {
    salesCount: sales.filter(s => s.status === 'COMPLETED').length,
    totalCents: sales.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + s.salePriceCents, 0),
    activeAgreements: views.filter(a => a.status === 'ACTIVE').length,
    outstandingCents: views.filter(a => a.status === 'ACTIVE').reduce((sum, a) => sum + a.balanceCents, 0),
    overdueAgreements: views.filter(a => a.overdue).length,
    overdueCents: views.reduce((sum, a) => sum + a.overdueCents, 0)
  };
  return { customer: customerView(customer), sales: sales.map(s => saleView(s, actor)), agreements: views, stats };
}

export async function updateCustomer(actor, shopId, idRaw, body = {}) {
  const fields = customerFields(body, { partial: true });
  if (!Object.keys(fields).length) throw badRequest('Nothing to change');
  try {
    return await inTransaction(async (session) => {
      const id = objectId(idRaw, 'customer ID');
      const before = await Customer.findOne({ _id: id, shopId }).session(session).lean();
      if (!before) throw notFound('Customer not found');
      if (fields.cnic !== undefined) await assertCnicFree(shopId, fields.cnic, id, session);
      const after = await Customer.findOneAndUpdate({ _id: id }, { $set: fields }, { new: true, session, lean: true });
      const keys = Object.keys(fields).filter(k => k !== 'phoneKey');
      await audit(session, {
        shopId, actor, action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: id, reason: text(body.reason, 'Reason', { max: 500 }),
        before: Object.fromEntries(keys.map(k => [k, before[k]])), after: Object.fromEntries(keys.map(k => [k, after[k]]))
      });
      return { customer: customerView(after) };
    });
  } catch (err) {
    if (err.code === 11000 && /cnic/.test(err.message)) throw conflict('Another customer already has this CNIC', 'DUPLICATE_CNIC');
    throw err;
  }
}

/** Owner removes a customer nobody has sold to (e.g. a duplicate). Audit-logged with a full copy. */
export async function deleteCustomer(actor, shopId, idRaw, body = {}) {
  const reason = text(body.reason, 'Reason', { required: true, max: 500 });
  return inTransaction(async (session) => {
    const id = objectId(idRaw, 'customer ID');
    const customer = await Customer.findOne({ _id: id, shopId }).session(session).lean();
    if (!customer) throw notFound('Customer not found');
    const linked = await SaleRecord.exists({ shopId, customerId: id }).session(session) || await InstallmentAgreement.exists({ shopId, customerId: id }).session(session);
    if (linked) throw conflict('This customer has sales and can’t be deleted', 'CUSTOMER_HAS_SALES');
    await CustomerDocument.deleteMany({ shopId, customerId: id }, { session });
    await Customer.deleteOne({ _id: id }, { session });
    await audit(session, { shopId, actor, action: 'CUSTOMER_DELETED', entityType: 'Customer', entityId: id, before: customerView(customer), reason });
  });
}

// ---------------------------------------------------------------- ID pictures

/** Parses "data:image/jpeg;base64,…" (or { contentType, data }) into bytes, checking type and size. */
function parseImage(body = {}) {
  let contentType = body.contentType;
  let base64 = body.data;
  if (typeof body.image === 'string') {
    const match = /^data:([a-z0-9.+/-]+);base64,(.+)$/is.exec(body.image.trim());
    if (!match) throw badRequest('Choose an image (JPEG, PNG or WebP)');
    [, contentType, base64] = match;
  }
  contentType = String(contentType ?? '').toLowerCase();
  if (!IMAGE_TYPES.includes(contentType) || typeof base64 !== 'string' || !base64) throw badRequest('Choose an image (JPEG, PNG or WebP)');
  const data = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
  if (!data.length) throw badRequest('Choose an image (JPEG, PNG or WebP)');
  if (data.length > MAX_IMAGE_BYTES) throw badRequest('Image must be smaller than 3 MB');
  return { contentType, data };
}

export async function addDocument(actor, shopId, idRaw, body = {}) {
  const kind = oneOf(body.kind, DOCUMENT_KINDS, 'Document kind', 'OTHER');
  const { contentType, data } = parseImage(body);
  return inTransaction(async (session) => {
    const id = objectId(idRaw, 'customer ID');
    const customer = await Customer.findOne({ _id: id, shopId }).session(session);
    if (!customer) throw notFound('Customer not found');
    if (customer.documents.length >= MAX_DOCUMENTS) throw conflict('A customer can have at most 4 ID pictures', 'TOO_MANY_DOCUMENTS');
    const docId = new mongoose.Types.ObjectId();
    await CustomerDocument.create([{ _id: docId, shopId, customerId: id, contentType, data }], { session });
    customer.documents.push({ _id: docId, kind, contentType, size: data.length, uploadedBy: actor });
    await customer.save({ session });
    const saved = customer.documents.id(docId);
    return { document: { _id: saved._id, kind: saved.kind, contentType: saved.contentType, size: saved.size, uploadedBy: saved.uploadedBy, createdAt: saved.createdAt } };
  });
}

/** The picture itself, as a data URL the apps can show directly. */
export async function getDocument(actor, shopId, idRaw, docIdRaw) {
  const customer = await Customer.findOne({ _id: objectId(idRaw, 'customer ID'), shopId }).select('documents').lean();
  if (!customer) throw notFound('Customer not found');
  const meta = customer.documents.find(d => String(d._id) === String(docIdRaw));
  const blob = meta ? await CustomerDocument.findOne({ _id: meta._id, shopId }).lean() : null;
  if (!meta || !blob) throw notFound('Document not found');
  return { document: { _id: meta._id, kind: meta.kind, contentType: meta.contentType, size: meta.size, uploadedBy: meta.uploadedBy, createdAt: meta.createdAt, dataUrl: `data:${blob.contentType};base64,${blob.data.toString('base64')}` } };
}

export async function deleteDocument(actor, shopId, idRaw, docIdRaw) {
  return inTransaction(async (session) => {
    const id = objectId(idRaw, 'customer ID');
    const docId = objectId(docIdRaw, 'document ID');
    const customer = await Customer.findOne({ _id: id, shopId }).session(session);
    if (!customer) throw notFound('Customer not found');
    const meta = customer.documents.id(docId);
    if (!meta) throw notFound('Document not found');
    meta.deleteOne();
    await customer.save({ session });
    await CustomerDocument.deleteOne({ _id: docId, shopId }, { session });
    await audit(session, { shopId, actor, action: 'CUSTOMER_DOCUMENT_DELETED', entityType: 'Customer', entityId: id, before: { documentId: docId, kind: meta.kind } });
  });
}

// ---------------------------------------------------------------- used by sales

/** Snapshot copied onto a sale or agreement. */
const snapshot = (c, extra = {}) => ({ name: c.name, phone: c.phone, address: c.address ?? '', reference: formatCnic(c.cnic) || extra.reference || '' });

/**
 * Which customer a sale is for. Either `customerId` (an existing record) or inline `customer`
 * details; inline details are matched to an existing record by CNIC, then phone, and otherwise
 * create one, so every installment buyer ends up with a customer record and history. A full-price
 * sale may have no customer at all (walk-in); one with a name and phone gets a record too.
 * Runs inside the sale's transaction.
 */
export async function resolveCustomer(actor, shopId, body = {}, { required, session }) {
  if (body.customerId !== undefined && body.customerId !== null && body.customerId !== '') {
    const customer = await Customer.findOne({ _id: objectId(body.customerId, 'customer ID'), shopId }).session(session).lean();
    if (!customer) throw notFound('Customer not found');
    return { customerId: customer._id, customer: snapshot(customer) };
  }
  const input = body.customer ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Invalid customer details');
  const name = text(input.name, 'Customer name', { required, max: 120 });
  const phone = text(input.phone, 'Customer phone', { required, max: 40 });
  const address = text(input.address, 'Customer address', { max: 300 });
  const reference = text(input.reference, 'Customer reference', { max: 60 });
  const cnic = input.cnic !== undefined && input.cnic !== null && String(input.cnic).trim() !== '' ? cnicField(input.cnic)
    : cnicDigits(reference).length === 13 && /^[\d-\s]+$/.test(reference) ? cnicDigits(reference) : '';
  if (!name || !phone) return { customerId: null, customer: { name, phone, address, reference } };

  let existing = cnic ? await Customer.findOne({ shopId, cnic }).session(session).lean() : null;
  if (!existing && phoneKey(phone)) existing = await Customer.findOne({ shopId, phoneKey: phoneKey(phone) }).session(session).lean();
  if (existing) {
    // Fill in what the record didn't know yet; never overwrite what it has.
    const fill = {};
    if (!existing.cnic && cnic) fill.cnic = cnic;
    if (!existing.address && address) fill.address = address;
    if (Object.keys(fill).length) await Customer.updateOne({ _id: existing._id }, { $set: fill }, { session });
    return { customerId: existing._id, customer: snapshot({ ...existing, ...fill }, { reference }) };
  }
  const [created] = await Customer.create([{ shopId, customerCode: await nextCustomerCode(shopId, session), name, phone, phoneKey: phoneKey(phone), cnic, address, createdBy: actor }], { session });
  return { customerId: created._id, customer: snapshot(created.toObject(), { reference }) };
}
