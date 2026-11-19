import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import InstallmentAgreement from '../models/InstallmentAgreement.js';
import InstallmentPayment from '../models/InstallmentPayment.js';
import InventoryUnit from '../models/InventoryUnit.js';
import SaleRecord from '../models/SaleRecord.js';
import { stockSummary } from './inventoryService.js';
import { agreementView } from './salesService.js';
import { dateInZone, periodStarts } from '../utils/time.js';

// All figures come from the database at request time. Money is integer paisa.
// Definitions (kept separate so nothing is counted twice):
//   sales value      = agreed price of completed sales (full price + installment)
//   collected        = full-price sales + every installment payment (down payment counted once)
//   receivable       = remaining balance of active installment agreements

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sumIf = (cond, value) => ({ $sum: { $cond: [cond, value, 0] } });
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

/** Sales totals (count, value) overall and for today / this week / this month. */
async function salesTotals(match, starts) {
  const [row] = await SaleRecord.aggregate([
    { $match: { ...match, status: 'COMPLETED' } },
    { $group: {
      _id: null,
      count: { $sum: 1 }, valueCents: { $sum: '$salePriceCents' }, discountCents: { $sum: '$discountCents' },
      todayCount: countIf({ $gte: ['$soldAt', starts.dayStart] }), todayCents: sumIf({ $gte: ['$soldAt', starts.dayStart] }, '$salePriceCents'),
      weekCount: countIf({ $gte: ['$soldAt', starts.weekStart] }), weekCents: sumIf({ $gte: ['$soldAt', starts.weekStart] }, '$salePriceCents'),
      monthCount: countIf({ $gte: ['$soldAt', starts.monthStart] }), monthCents: sumIf({ $gte: ['$soldAt', starts.monthStart] }, '$salePriceCents')
    } }
  ]);
  const zero = { count: 0, valueCents: 0, discountCents: 0, todayCount: 0, todayCents: 0, weekCount: 0, weekCents: 0, monthCount: 0, monthCents: 0 };
  if (!row) return zero;
  delete row._id;
  return row;
}

/** Payments received, split into down payments and later installments. */
async function paymentTotals(match) {
  const rows = await InstallmentPayment.aggregate([{ $match: match }, { $group: { _id: '$kind', cents: { $sum: '$amountCents' }, count: { $sum: 1 } } }]);
  const by = Object.fromEntries(rows.map(r => [r._id, r]));
  return { downPaymentsCents: by.DOWN_PAYMENT?.cents ?? 0, installmentPaymentsCents: by.INSTALLMENT?.cents ?? 0 };
}

/** Agreement counts and balances; overdue figures come from each agreement's schedule. */
async function agreementTotals(match, today) {
  const [row] = await InstallmentAgreement.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      totalValueCents: sumIf({ $ne: ['$status', 'CANCELLED'] }, '$totalPriceCents'),
      outstandingCents: sumIf({ $eq: ['$status', 'ACTIVE'] }, '$balanceCents'),
      active: countIf({ $eq: ['$status', 'ACTIVE'] }),
      completed: countIf({ $eq: ['$status', 'COMPLETED'] }),
      cancelled: countIf({ $eq: ['$status', 'CANCELLED'] })
    } }
  ]);
  const overdueAgreements = await InstallmentAgreement.find({ ...match, status: 'ACTIVE', nextDueDate: { $lt: today } }).lean();
  const overdueCents = overdueAgreements.reduce((sum, a) => sum + agreementView(a, today).overdueCents, 0);
  return {
    totalValueCents: row?.totalValueCents ?? 0, outstandingCents: row?.outstandingCents ?? 0,
    active: row?.active ?? 0, completed: row?.completed ?? 0, cancelled: row?.cancelled ?? 0,
    overdue: overdueAgreements.length, overdueCents
  };
}

/** Daily (30 days), weekly (12 weeks) and monthly (12 months) sales series in the shop's timezone. */
async function salesSeries(match, tz) {
  const series = async (unit, since) => SaleRecord.aggregate([
    { $match: { ...match, status: 'COMPLETED', soldAt: { $gte: since } } },
    { $group: { _id: { $dateTrunc: { date: '$soldAt', unit, timezone: tz, startOfWeek: 'monday' } }, count: { $sum: 1 }, valueCents: { $sum: '$salePriceCents' } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: { $dateToString: { date: '$_id', format: '%Y-%m-%d', timezone: tz } }, count: 1, valueCents: 1 } }
  ]);
  const now = Date.now();
  return {
    daily: await series('day', new Date(now - 31 * 864e5)),
    weekly: await series('week', new Date(now - 7 * 13 * 864e5)),
    monthly: await series('month', new Date(now - 366 * 864e5))
  };
}

/** Per-person performance: units added, sales by kind, value. Includes the owner as a seller. */
async function performance(shopId) {
  const shop = oid(shopId);
  const [sales, added, employees] = await Promise.all([
    SaleRecord.aggregate([
      { $match: { shopId: shop, status: 'COMPLETED' } },
      { $group: {
        _id: '$soldBy.id', type: { $first: '$soldBy.type' }, name: { $last: '$soldBy.name' }, employeeId: { $last: '$soldBy.employeeId' },
        fullPriceCount: countIf({ $eq: ['$type', 'FULL_PRICE'] }), fullPriceCents: sumIf({ $eq: ['$type', 'FULL_PRICE'] }, '$salePriceCents'),
        installmentCount: countIf({ $eq: ['$type', 'INSTALLMENT'] }), installmentCents: sumIf({ $eq: ['$type', 'INSTALLMENT'] }, '$salePriceCents')
      } }
    ]),
    InventoryUnit.aggregate([{ $match: { shopId: shop } }, { $group: { _id: '$addedBy.id', unitsAdded: { $sum: 1 } } }]),
    Employee.find({ shopId: shop }).select('name employeeId status').lean()
  ]);
  const rows = new Map();
  const row = (id, base) => { const key = String(id); if (!rows.has(key)) rows.set(key, { id: key, unitsAdded: 0, fullPriceCount: 0, fullPriceCents: 0, installmentCount: 0, installmentCents: 0, ...base }); return rows.get(key); };
  for (const e of employees) row(e._id, { type: 'employee', name: e.name, employeeId: e.employeeId, status: e.status });
  for (const s of sales) Object.assign(row(s._id, { type: s.type, name: s.name, employeeId: s.employeeId }), {
    fullPriceCount: s.fullPriceCount, fullPriceCents: s.fullPriceCents, installmentCount: s.installmentCount, installmentCents: s.installmentCents
  });
  for (const a of added) if (rows.has(String(a._id)) || String(a._id) === String(shopId)) row(a._id, { type: 'owner', name: 'Shop owner', employeeId: '' }).unitsAdded = a.unitsAdded;
  return [...rows.values()]
    .map(r => ({ ...r, totalSalesCents: r.fullPriceCents + r.installmentCents }))
    .sort((a, b) => b.totalSalesCents - a.totalSalesCents);
}

export async function partnerSummary(actor, shop) {
  const starts = periodStarts(shop.timezone);
  const match = { shopId: shop._id };
  const [stock, fullPrice, installment, payments, agreements, customerCount] = await Promise.all([
    stockSummary(actor, shop._id),
    salesTotals({ ...match, type: 'FULL_PRICE' }, starts),
    salesTotals({ ...match, type: 'INSTALLMENT' }, starts),
    paymentTotals(match),
    agreementTotals(match, starts.today),
    Customer.countDocuments({ shopId: shop._id })
  ]);
  return {
    timezone: shop.timezone, today: starts.today,
    stock,
    customers: { total: customerCount },
    sales: {
      totalValueCents: fullPrice.valueCents + installment.valueCents,
      todayValueCents: fullPrice.todayCents + installment.todayCents,
      todayCount: fullPrice.todayCount + installment.todayCount,
      monthValueCents: fullPrice.monthCents + installment.monthCents,
      fullPriceRevenueCents: fullPrice.valueCents,
      installmentValueCents: installment.valueCents
    },
    collected: {
      fullPriceCents: fullPrice.valueCents,
      downPaymentsCents: payments.downPaymentsCents,
      installmentPaymentsCents: payments.installmentPaymentsCents,
      totalCents: fullPrice.valueCents + payments.downPaymentsCents + payments.installmentPaymentsCents
    },
    installments: agreements
  };
}

export async function fullPriceDashboard(actor, shop) {
  const starts = periodStarts(shop.timezone);
  const match = { shopId: shop._id, type: 'FULL_PRICE' };
  const [totals, series, people] = await Promise.all([salesTotals(match, starts), salesSeries(match, shop.timezone), performance(shop._id)]);
  return {
    timezone: shop.timezone, today: starts.today, totals, series,
    byEmployee: people.map(p => ({ id: p.id, type: p.type, name: p.name, employeeId: p.employeeId, count: p.fullPriceCount, valueCents: p.fullPriceCents }))
      .filter(p => p.count > 0 || p.type === 'employee')
  };
}

export async function installmentDashboard(actor, shop) {
  const starts = periodStarts(shop.timezone);
  const match = { shopId: shop._id };
  const [installment, payments, agreements] = await Promise.all([
    salesTotals({ ...match, type: 'INSTALLMENT' }, starts),
    paymentTotals(match),
    agreementTotals(match, starts.today)
  ]);
  return {
    timezone: shop.timezone, today: starts.today,
    totalSalesValueCents: agreements.totalValueCents,
    salesCount: installment.count,
    downPaymentsCollectedCents: payments.downPaymentsCents,
    installmentPaymentsCollectedCents: payments.installmentPaymentsCents,
    totalCollectedCents: payments.downPaymentsCents + payments.installmentPaymentsCents,
    outstandingCents: agreements.outstandingCents,
    overdueCents: agreements.overdueCents,
    overdueAgreements: agreements.overdue,
    activeAgreements: agreements.active,
    completedAgreements: agreements.completed,
    cancelledAgreements: agreements.cancelled
  };
}

export const employeePerformance = (shop) => performance(shop._id);

/** The signed-in employee's own figures. */
export async function employeeSummary(actor, shop) {
  const starts = periodStarts(shop.timezone);
  const me = oid(actor.id);
  const match = { shopId: shop._id, 'soldBy.id': me };
  const [unitsAdded, fullPrice, installment, agreements] = await Promise.all([
    InventoryUnit.countDocuments({ shopId: shop._id, 'addedBy.id': me }),
    salesTotals({ ...match, type: 'FULL_PRICE' }, starts),
    salesTotals({ ...match, type: 'INSTALLMENT' }, starts),
    agreementTotals(match, starts.today)
  ]);
  return {
    timezone: shop.timezone, today: dateInZone(shop.timezone),
    unitsAdded,
    fullPriceCount: fullPrice.count, installmentCount: installment.count,
    totalSalesCents: fullPrice.valueCents + installment.valueCents,
    todaySalesCents: fullPrice.todayCents + installment.todayCents, todayCount: fullPrice.todayCount + installment.todayCount,
    monthSalesCents: fullPrice.monthCents + installment.monthCents, monthCount: fullPrice.monthCount + installment.monthCount,
    installments: { outstandingCents: agreements.outstandingCents, overdue: agreements.overdue, active: agreements.active, completed: agreements.completed }
  };
}
