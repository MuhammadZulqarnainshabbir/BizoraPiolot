import * as receipts from '../services/receiptService.js';
import * as sales from '../services/salesService.js';
import { handle, toCsv } from '../utils/http.js';

function sendPdf(res, { filename, pdf }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdf.length);
  res.send(pdf);
}

/** PDF receipt for a sale (full-price receipt, or installment agreement with schedule and payments). */
export const saleReceipt = handle(async (req, res) => sendPdf(res, await receipts.saleReceipt(req.actor, req.shop, req.params.id)));
/** PDF receipt for one installment payment. */
export const paymentReceipt = handle(async (req, res) => sendPdf(res, await receipts.paymentReceipt(req.actor, req.shop, req.params.id, req.params.paymentId)));

export const sellFullPrice = handle(async (req, res) => res.status(201).json(await sales.sellFullPrice(req.actor, req.shop, req.body)));
export const sellInstallment = handle(async (req, res) => res.status(201).json(await sales.sellInstallment(req.actor, req.shop, req.body)));
export const listFullPrice = handle(async (req, res) => res.json(await sales.listFullPriceSales(req.actor, req.shop, req.query)));
export const listInstallment = handle(async (req, res) => res.json(await sales.listInstallmentSales(req.actor, req.shop, req.query)));
export const listMySales = handle(async (req, res) => res.json(await sales.listMySales(req.actor, req.shop, req.query)));
export const listSales = handle(async (req, res) => res.json(await sales.listSales(req.actor, req.shop, req.query)));
export const getSale = handle(async (req, res) => res.json(await sales.getSale(req.actor, req.shop, req.params.id)));
export const cancelSale = handle(async (req, res) => res.json(await sales.correctSale(req.actor, req.shop, req.params.id, 'cancel', req.body)));
export const refundSale = handle(async (req, res) => res.json(await sales.correctSale(req.actor, req.shop, req.params.id, 'refund', req.body)));

export const getAgreement = handle(async (req, res) => res.json(await sales.getAgreement(req.actor, req.shop, req.params.id)));
export const listPayments = handle(async (req, res) => res.json(await sales.listPayments(req.actor, req.shop, req.params.id)));
export const recordPayment = handle(async (req, res) => res.status(201).json(await sales.recordPayment(req.actor, req.shop, req.params.id, req.body)));

const money = (cents) => cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
const local = (date, tz) => {
  if (!date) return { date: '', time: '' };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(date)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const seller = (s) => s.soldBy.type === 'owner' ? 'Shop owner' : s.soldBy.name;

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM so Excel reads Urdu names correctly
}

/** Full-price sales as CSV (owner). Dates and times in the shop's timezone. */
export const exportFullPrice = handle(async (req, res) => {
  const rows = await sales.exportRows(req.actor, req.shop, req.query, 'full-price');
  const tz = req.shop.timezone;
  sendCsv(res, `full-price-sales-${local(new Date(), tz).date}.csv`, toCsv([
    { header: 'Sale number', value: s => s.saleNumber },
    { header: `Date (${tz})`, value: s => local(s.soldAt, tz).date },
    { header: 'Time', value: s => local(s.soldAt, tz).time },
    { header: 'Product', value: s => s.item.productName },
    { header: 'Brand', value: s => s.item.brand },
    { header: 'Model', value: s => s.item.model },
    { header: 'Serial number', value: s => s.item.serialNumber },
    { header: 'List price (Rs)', value: s => money(s.item.listPriceCents) },
    { header: 'Sale price (Rs)', value: s => money(s.salePriceCents) },
    { header: 'Discount (Rs)', value: s => money(s.discountCents) },
    { header: 'Payment method', value: s => s.paymentMethod },
    { header: 'Sold by', value: seller },
    { header: 'Employee ID', value: s => s.soldBy.employeeId },
    { header: 'Customer name', value: s => s.customer?.name },
    { header: 'Customer phone', value: s => s.customer?.phone },
    { header: 'Status', value: s => s.status }
  ], rows));
});

/** Installment agreements as CSV (owner). */
export const exportInstallment = handle(async (req, res) => {
  const rows = await sales.exportRows(req.actor, req.shop, req.query, 'installment');
  const tz = req.shop.timezone;
  sendCsv(res, `installment-sales-${local(new Date(), tz).date}.csv`, toCsv([
    { header: 'Agreement number', value: a => a.agreementNumber },
    { header: `Sale date (${tz})`, value: a => local(a.createdAt, tz).date },
    { header: 'Product', value: a => a.item.productName },
    { header: 'Serial number', value: a => a.item.serialNumber },
    { header: 'Total price (Rs)', value: a => money(a.totalPriceCents) },
    { header: 'Down payment (Rs)', value: a => money(a.downPaymentCents) },
    { header: 'Collected (Rs)', value: a => money(a.collectedCents) },
    { header: 'Balance (Rs)', value: a => money(a.balanceCents) },
    { header: 'Installments', value: a => a.installmentCount },
    { header: 'Frequency', value: a => a.frequency },
    { header: 'Next due date', value: a => a.nextDueDate ?? '' },
    { header: 'Overdue (Rs)', value: a => money(a.overdueCents) },
    { header: 'Status', value: a => a.displayStatus },
    { header: 'Sold by', value: seller },
    { header: 'Employee ID', value: a => a.soldBy.employeeId },
    { header: 'Customer name', value: a => a.customer?.name },
    { header: 'Customer phone', value: a => a.customer?.phone }
  ], rows));
});
