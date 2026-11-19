import mongoose from 'mongoose';
import { can } from '../config/permissions.js';
import InstallmentAgreement, { AGREEMENT_STATUSES, FREQUENCIES } from '../models/InstallmentAgreement.js';
import InstallmentPayment from '../models/InstallmentPayment.js';
import InventoryUnit from '../models/InventoryUnit.js';
import SaleRecord, { SALE_STATUSES } from '../models/SaleRecord.js';
import { audit } from './audit.js';
import { resolveCustomer } from './customerService.js';
import { dateRange } from './inventoryService.js';
import { nextAgreementNumber, nextSaleNumber } from './sequences.js';
import { listPage } from '../utils/listing.js';
import { badRequest, conflict, forbidden, inTransaction, money, notFound, objectId, oneOf, paymentMethod, text, wholeNumber } from '../utils/http.js';
import { addDays, addMonths, dateInZone, isYmd } from '../utils/time.js';

const MAX_INSTALLMENTS = 120;

const SALE_LIST = {
  sortFields: ['soldAt', 'salePriceCents'],
  searchFields: ['saleNumber', 'item.productName', 'item.serialNumber', 'item.serialKey', 'item.brand', 'item.model', 'customer.name', 'customer.phone'],
  defaultSort: 'soldAt'
};
const AGREEMENT_LIST = {
  sortFields: ['createdAt', 'balanceCents', 'totalPriceCents', 'nextDueDate'],
  searchFields: ['agreementNumber', 'item.productName', 'item.serialNumber', 'customer.name', 'customer.phone'],
  defaultSort: 'createdAt'
};

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// ---------------------------------------------------------------- views

/** Sale as a user may see it: cost and margin are owner-only. */
export function saleView(sale, actor) {
  const view = { ...sale };
  delete view.__v;
  if (view.item) {
    view.item = { ...view.item };
    delete view.item.serialKey;
    if (!can(actor, 'inventory.viewCost')) delete view.item.purchasePriceCents;
  }
  return view;
}

/** Agreement plus derived fields: overdue flag, overdue amount, display status, per-installment states. */
export function agreementView(agreement, today) {
  const view = { ...agreement };
  delete view.__v;
  let covered = agreement.collectedCents - agreement.downPaymentCents;
  let overdueCents = 0;
  view.schedule = agreement.schedule.map(entry => {
    const paid = Math.min(Math.max(covered, 0), entry.amountCents);
    covered -= entry.amountCents;
    let state = paid >= entry.amountCents ? 'PAID' : entry.dueDate < today ? 'OVERDUE' : paid > 0 ? 'PARTLY_PAID' : 'UPCOMING';
    if (agreement.status === 'CANCELLED' && state !== 'PAID') state = 'CANCELLED';
    if (state === 'OVERDUE') overdueCents += entry.amountCents - paid;
    return { ...entry, paidCents: paid, state };
  });
  view.overdue = agreement.status === 'ACTIVE' && Boolean(agreement.nextDueDate && agreement.nextDueDate < today);
  view.overdueCents = agreement.status === 'ACTIVE' ? overdueCents : 0;
  view.displayStatus = view.overdue ? 'OVERDUE' : agreement.status;
  return view;
}

/** Schedule position after `collectedCents`: the next unpaid installment, or null when fully paid. */
function nextDue(schedule, collectedCents, downPaymentCents) {
  let covered = collectedCents - downPaymentCents;
  for (const entry of schedule) {
    if (covered >= entry.amountCents) { covered -= entry.amountCents; continue; }
    return { date: entry.dueDate, cents: entry.amountCents - Math.max(covered, 0) };
  }
  return { date: null, cents: null };
}

/** Even installments; the last absorbs the rounding remainder so the total is exact. */
export function buildSchedule(financedCents, count, frequency, firstDueDate, intervalDays) {
  const base = Math.floor(financedCents / count);
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    dueDate: frequency === 'MONTHLY' ? addMonths(firstDueDate, i)
      : frequency === 'WEEKLY' ? addDays(firstDueDate, 7 * i)
      : addDays(firstDueDate, intervalDays * i),
    amountCents: i === count - 1 ? financedCents - base * (count - 1) : base
  }));
}

// ---------------------------------------------------------------- selling

/**
 * Marks the unit sold in the caller's transaction. Only an AVAILABLE unit with a real serial
 * number can be sold; concurrent attempts conflict and the loser gets ALREADY_SOLD.
 */
async function takeUnit(session, shopId, unitId, status, soldAt) {
  const unit = await InventoryUnit.findOneAndUpdate(
    { _id: unitId, shopId, status: 'AVAILABLE', serialPending: false },
    { $set: { status, soldAt } },
    { new: true, session, lean: true }
  );
  if (unit) return unit;
  const current = await InventoryUnit.findOne({ _id: unitId, shopId }).session(session).lean();
  if (!current) throw notFound('Inventory unit not found');
  if (current.serialPending) throw conflict('Enter this unit’s real serial number before selling it', 'SERIAL_PENDING');
  throw conflict('This unit has already been sold', 'ALREADY_SOLD');
}

function itemSnapshot(unit) {
  return {
    productCode: unit.productCode, productName: unit.productName, brand: unit.brand, model: unit.model,
    category: unit.category, subCategory: unit.subCategory, serialNumber: unit.serialNumber, serialKey: unit.serialKey,
    listPriceCents: unit.sellingPriceCents, purchasePriceCents: unit.purchasePriceCents
  };
}

export async function sellFullPrice(actor, shop, body = {}) {
  const unitId = objectId(body.unitId, 'unit ID');
  const salePriceCents = money(body.salePrice, 'Sale price');
  const method = paymentMethod(body.paymentMethod);
  const note = text(body.note, 'Note', { max: 500 });

  return inTransaction(async (session) => {
    const soldAt = new Date();
    const { customerId, customer } = await resolveCustomer(actor, shop._id, body, { required: false, session });
    const unit = await takeUnit(session, shop._id, unitId, 'SOLD_FULL_PRICE', soldAt);
    const [sale] = await SaleRecord.create([{
      shopId: shop._id, saleNumber: await nextSaleNumber(shop._id, session), type: 'FULL_PRICE',
      unitId: unit._id, productId: unit.productId, item: itemSnapshot(unit),
      salePriceCents, discountCents: Math.max(0, unit.sellingPriceCents - salePriceCents),
      paymentMethod: method, customerId: customerId ?? undefined, customer, note, soldBy: actor, soldAt, status: 'COMPLETED'
    }], { session });
    await InventoryUnit.updateOne({ _id: unit._id }, { $set: { saleId: sale._id } }, { session });
    return { sale: saleView(sale.toObject(), actor) };
  });
}

export async function sellInstallment(actor, shop, body = {}) {
  const unitId = objectId(body.unitId, 'unit ID');
  const totalPriceCents = money(body.totalPrice, 'Total installment price', { allowZero: false });
  const downPaymentCents = money(body.downPayment ?? 0, 'Down payment');
  if (downPaymentCents >= totalPriceCents) throw badRequest('Down payment must be less than the total price. Use a full-price sale instead.');
  const installmentCount = wholeNumber(body.installmentCount, 'Number of installments', 1, MAX_INSTALLMENTS);
  const frequency = oneOf(body.frequency, FREQUENCIES, 'Installment frequency', 'MONTHLY');
  const intervalDays = frequency === 'CUSTOM' ? wholeNumber(body.intervalDays, 'Days between installments', 1, 365) : undefined;
  const today = dateInZone(shop.timezone);
  let firstDueDate = body.firstDueDate;
  if (firstDueDate === undefined || firstDueDate === '' || firstDueDate === null) {
    firstDueDate = frequency === 'MONTHLY' ? addMonths(today, 1) : addDays(today, frequency === 'WEEKLY' ? 7 : intervalDays);
  } else if (!isYmd(firstDueDate) || firstDueDate < today || firstDueDate > addMonths(today, 12)) {
    throw badRequest('First due date must be between today and one year from now');
  }
  const method = paymentMethod(body.paymentMethod);
  const notes = text(body.notes, 'Notes', { max: 500 });
  const financedCents = totalPriceCents - downPaymentCents;
  const schedule = buildSchedule(financedCents, installmentCount, frequency, firstDueDate, intervalDays);

  return inTransaction(async (session) => {
    const soldAt = new Date();
    // Installment buyers always get a customer record (matched or created), so their history and ID pictures have a home.
    const { customerId, customer } = await resolveCustomer(actor, shop._id, body, { required: true, session });
    const unit = await takeUnit(session, shop._id, unitId, 'SOLD_INSTALLMENT', soldAt);
    const saleId = new mongoose.Types.ObjectId();
    const agreementId = new mongoose.Types.ObjectId();
    const [agreement] = await InstallmentAgreement.create([{
      _id: agreementId, shopId: shop._id, agreementNumber: await nextAgreementNumber(shop._id, session), saleId, unitId: unit._id,
      item: { productName: unit.productName, serialNumber: unit.serialNumber }, customerId, customer,
      totalPriceCents, downPaymentCents, financedCents, installmentCount, frequency, intervalDays, schedule,
      collectedCents: downPaymentCents, balanceCents: financedCents,
      nextDueDate: schedule[0].dueDate, nextDueCents: schedule[0].amountCents,
      status: 'ACTIVE', soldBy: actor, notes
    }], { session });
    const [sale] = await SaleRecord.create([{
      _id: saleId, shopId: shop._id, saleNumber: await nextSaleNumber(shop._id, session), type: 'INSTALLMENT',
      unitId: unit._id, productId: unit.productId, item: itemSnapshot(unit),
      salePriceCents: totalPriceCents, discountCents: Math.max(0, unit.sellingPriceCents - totalPriceCents),
      paymentMethod: method, customerId, customer, note: notes, soldBy: actor, soldAt, status: 'COMPLETED', installmentAgreementId: agreementId
    }], { session });
    const payments = downPaymentCents > 0
      ? await InstallmentPayment.create([{ shopId: shop._id, agreementId, saleId, kind: 'DOWN_PAYMENT', amountCents: downPaymentCents, method, paidAt: soldAt, recordedBy: actor }], { session })
      : [];
    await InventoryUnit.updateOne({ _id: unit._id }, { $set: { saleId } }, { session });
    return {
      sale: saleView(sale.toObject(), actor),
      agreement: agreementView(agreement.toObject(), today),
      payments: payments.map(p => p.toObject())
    };
  });
}

// ---------------------------------------------------------------- installment payments

/** Owner records money received on an agreement. Overpayment is impossible, even with concurrent requests. */
export async function recordPayment(actor, shop, agreementIdRaw, body = {}) {
  const agreementId = objectId(agreementIdRaw, 'agreement ID');
  const amountCents = money(body.amount, 'Payment amount', { allowZero: false });
  const method = paymentMethod(body.method);
  const note = text(body.note, 'Note', { max: 300 });

  return inTransaction(async (session) => {
    let agreement = await InstallmentAgreement.findOneAndUpdate(
      { _id: agreementId, shopId: shop._id, status: 'ACTIVE', balanceCents: { $gte: amountCents } },
      { $inc: { collectedCents: amountCents, balanceCents: -amountCents } },
      { new: true, session, lean: true }
    );
    if (!agreement) {
      const current = await InstallmentAgreement.findOne({ _id: agreementId, shopId: shop._id }).session(session).lean();
      if (!current) throw notFound('Installment agreement not found');
      if (current.status === 'CANCELLED') throw conflict('This installment agreement was cancelled', 'AGREEMENT_CANCELLED');
      if (current.status === 'COMPLETED') throw conflict('This installment agreement is already fully paid', 'AGREEMENT_COMPLETED');
      throw conflict(`Payment exceeds the remaining balance of Rs ${(current.balanceCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, 'OVERPAYMENT');
    }
    const due = nextDue(agreement.schedule, agreement.collectedCents, agreement.downPaymentCents);
    agreement = await InstallmentAgreement.findOneAndUpdate({ _id: agreementId }, { $set: {
      nextDueDate: due.date, nextDueCents: due.cents, ...(agreement.balanceCents === 0 ? { status: 'COMPLETED' } : {})
    } }, { new: true, session, lean: true });
    const [payment] = await InstallmentPayment.create([{
      shopId: shop._id, agreementId, saleId: agreement.saleId, kind: 'INSTALLMENT', amountCents, method, paidAt: new Date(), recordedBy: actor, note
    }], { session });
    const payments = await InstallmentPayment.find({ agreementId }).sort({ paidAt: 1 }).session(session).lean();
    return { agreement: agreementView(agreement, dateInZone(shop.timezone)), payment: payment.toObject(), payments };
  });
}

// ---------------------------------------------------------------- corrections (owner)

/**
 * Cancels or refunds a completed sale (owner only, reason required, audit-logged). An installment
 * sale's agreement is cancelled too. The unit is NOT returned to stock automatically.
 */
export async function correctSale(actor, shop, saleIdRaw, action, body = {}) {
  const saleId = objectId(saleIdRaw, 'sale ID');
  const reason = text(body.reason, 'Reason', { required: true, max: 500 });
  const status = action === 'refund' ? 'REFUNDED' : 'CANCELLED';
  return inTransaction(async (session) => {
    const cancellation = { at: new Date(), by: actor, reason };
    const sale = await SaleRecord.findOneAndUpdate(
      { _id: saleId, shopId: shop._id, status: 'COMPLETED' },
      { $set: { status, cancellation } },
      { new: true, session, lean: true }
    );
    if (!sale) {
      const current = await SaleRecord.exists({ _id: saleId, shopId: shop._id }).session(session);
      if (!current) throw notFound('Sale not found');
      throw conflict('This sale was already cancelled or refunded', 'SALE_NOT_COMPLETED');
    }
    let agreement = null;
    if (sale.installmentAgreementId) {
      agreement = await InstallmentAgreement.findOneAndUpdate(
        { _id: sale.installmentAgreementId, status: { $ne: 'CANCELLED' } },
        { $set: { status: 'CANCELLED', cancellation, nextDueDate: null, nextDueCents: null } },
        { new: true, session, lean: true }
      );
    }
    await audit(session, {
      shopId: shop._id, actor, action: status === 'REFUNDED' ? 'SALE_REFUNDED' : 'SALE_CANCELLED', entityType: 'Sale', entityId: sale._id, reason,
      before: { status: 'COMPLETED', agreementStatus: agreement ? 'ACTIVE_OR_COMPLETED' : undefined },
      after: { status, agreementStatus: agreement?.status }
    });
    return { sale: saleView(sale, actor), agreement: agreement ? agreementView(agreement, dateInZone(shop.timezone)) : null };
  });
}

// ---------------------------------------------------------------- reading

/** Owners see every sale; employees only their own (enforced here, whatever the query says). */
function scopeFilter(actor, query, field) {
  if (!can(actor, 'sales.viewAll')) return { [field]: oid(actor.id) };
  if (query.soldBy === 'owner') return { [field.replace('.id', '.type')]: 'owner' };
  if (query.soldBy) return { [field]: objectId(query.soldBy, 'employee') };
  return {};
}

function saleFilters(actor, shop, query, type) {
  const extra = { ...scopeFilter(actor, query, 'soldBy.id') };
  if (type) extra.type = type;
  else if (query.type) extra.type = oneOf(query.type, ['FULL_PRICE', 'INSTALLMENT'], 'Sale type');
  if (query.status) extra.status = oneOf(query.status, SALE_STATUSES, 'Status');
  if (query.customerId) extra.customerId = objectId(query.customerId, 'customer ID');
  const range = dateRange(query, shop.timezone);
  if (range) extra.soldAt = range;
  return extra;
}

export async function listFullPriceSales(actor, shop, query) {
  const { records, ...meta } = await listPage(SaleRecord, shop._id, query, SALE_LIST, saleFilters(actor, shop, query, 'FULL_PRICE'));
  return { items: records.map(s => saleView(s, actor)), ...meta };
}

/** The user's own sales of both kinds, with installment progress attached. */
export async function listMySales(actor, shop, query) {
  return listSales(actor, shop, query, { 'soldBy.id': oid(actor.id) });
}

/**
 * Sales history of both kinds, with installment progress attached. Owners see the whole shop
 * (optionally filtered by seller); employees only their own.
 */
export async function listSales(actor, shop, query, forced = {}) {
  const extra = { ...saleFilters(actor, shop, forced['soldBy.id'] ? { ...query, soldBy: undefined } : query), ...forced };
  const { records, ...meta } = await listPage(SaleRecord, shop._id, query, SALE_LIST, extra);
  const agreements = await InstallmentAgreement.find({ _id: { $in: records.map(s => s.installmentAgreementId).filter(Boolean) } }).lean();
  const today = dateInZone(shop.timezone);
  const byId = Object.fromEntries(agreements.map(a => [a._id, agreementView(a, today)]));
  return { items: records.map(s => ({ ...saleView(s, actor), agreement: s.installmentAgreementId ? byId[s.installmentAgreementId] ?? null : null })), ...meta };
}

/** Installment agreements. status may be ACTIVE | COMPLETED | CANCELLED | OVERDUE. */
export async function listInstallmentSales(actor, shop, query) {
  const today = dateInZone(shop.timezone);
  const extra = { ...scopeFilter(actor, query, 'soldBy.id') };
  if (query.status === 'OVERDUE') Object.assign(extra, { status: 'ACTIVE', nextDueDate: { $lt: today } });
  else if (query.status) extra.status = oneOf(query.status, AGREEMENT_STATUSES, 'Status');
  if (query.customerId) extra.customerId = objectId(query.customerId, 'customer ID');
  const range = dateRange(query, shop.timezone);
  if (range) extra.createdAt = range;
  const { records, ...meta } = await listPage(InstallmentAgreement, shop._id, query, AGREEMENT_LIST, extra);
  return { items: records.map(a => agreementView(a, today)), ...meta };
}

function assertCanSee(actor, record) {
  if (!can(actor, 'sales.viewAll') && String(record.soldBy.id) !== String(actor.id)) {
    // Same answer as "doesn't exist", so IDs of other people's sales can't be probed.
    throw notFound('Sale not found');
  }
}

export async function getSale(actor, shop, idRaw) {
  const sale = await SaleRecord.findOne({ _id: objectId(idRaw, 'sale ID'), shopId: shop._id }).lean();
  if (!sale) throw notFound('Sale not found');
  assertCanSee(actor, sale);
  const today = dateInZone(shop.timezone);
  const agreement = sale.installmentAgreementId ? await InstallmentAgreement.findById(sale.installmentAgreementId).lean() : null;
  const payments = agreement ? await InstallmentPayment.find({ agreementId: agreement._id }).sort({ paidAt: 1 }).lean() : [];
  return { sale: saleView(sale, actor), agreement: agreement ? agreementView(agreement, today) : null, payments };
}

export async function getAgreement(actor, shop, idRaw) {
  const agreement = await InstallmentAgreement.findOne({ _id: objectId(idRaw, 'agreement ID'), shopId: shop._id }).lean();
  if (!agreement) throw notFound('Installment agreement not found');
  try { assertCanSee(actor, agreement); } catch { throw notFound('Installment agreement not found'); }
  const sale = await SaleRecord.findById(agreement.saleId).lean();
  const payments = await InstallmentPayment.find({ agreementId: agreement._id }).sort({ paidAt: 1 }).lean();
  return { agreement: agreementView(agreement, dateInZone(shop.timezone)), sale: sale ? saleView(sale, actor) : null, payments };
}

export async function listPayments(actor, shop, idRaw) {
  const { payments } = await getAgreement(actor, shop, idRaw);
  return { items: payments };
}

/** Rows for CSV export (owner), same filters as the lists, capped. */
export async function exportRows(actor, shop, query, kind) {
  if (!can(actor, 'reports.export')) throw forbidden();
  const limit = 10000;
  if (kind === 'installment') {
    const today = dateInZone(shop.timezone);
    const extra = { shopId: shop._id, ...scopeFilter(actor, query, 'soldBy.id') };
    if (query.status === 'OVERDUE') Object.assign(extra, { status: 'ACTIVE', nextDueDate: { $lt: today } });
    else if (query.status) extra.status = oneOf(query.status, AGREEMENT_STATUSES, 'Status');
    const range = dateRange(query, shop.timezone);
    if (range) extra.createdAt = range;
    const rows = await InstallmentAgreement.find(extra).sort({ createdAt: -1 }).limit(limit).lean();
    return rows.map(a => agreementView(a, today));
  }
  return SaleRecord.find({ shopId: shop._id, ...saleFilters(actor, shop, query, 'FULL_PRICE') }).sort({ soldAt: -1 }).limit(limit).lean();
}
