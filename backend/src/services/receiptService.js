import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import Employee from '../models/Employee.js';
import Shop from '../models/Shop.js';
import { getAgreement, getSale } from './salesService.js';
import { notFound } from '../utils/http.js';

/**
 * PDF receipts, generated on the server so every copy of a receipt is identical and includes the
 * same legally relevant details: the business (name, address, phone, email, NTN and STRN when
 * registered), a unique receipt number and date, the selling agent, the buyer (name, phone, CNIC,
 * address), the goods (description, brand, model, serial number), prices, discount, payment
 * method, and for installment sales the agreed plan, schedule and payments received.
 *
 * Fonts: Noto Sans for Latin text and Noto Sans Arabic for names typed in Urdu, so nothing is
 * replaced by boxes. Receipts are in English; the shop's own terms are printed as typed.
 */

const require = createRequire(import.meta.url);
const FONTS = {
  latin: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
  latinBold: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'),
  arabic: require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff'),
  arabicBold: require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff')
};
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

const INK = '#171717';
const MUTED = '#5f5950';
const GOLD = '#7A6240';
const LINE = '#E5DDD0';
const PAGE_MARGIN = 40;

const DEFAULT_TERMS = 'Goods once sold are not returnable or exchangeable except under the manufacturer’s warranty terms. Please keep this receipt; it is required for warranty claims and service.';
const INSTALLMENT_TERMS = 'The buyer agrees to pay each installment on or before its due date. Payments are applied to the oldest unpaid installment first. The shop may record and pursue overdue amounts in accordance with applicable law. Ownership of the goods passes to the buyer when the final installment has been paid in full.';

const PAYMENT_METHOD_LABEL = { CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', OTHER: 'Other' };
const FREQUENCY_LABEL = { MONTHLY: 'Monthly', WEEKLY: 'Weekly', CUSTOM: 'Custom' };
const STATE_LABEL = { PAID: 'Paid', PARTLY_PAID: 'Partly paid', UPCOMING: 'Upcoming', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' };
const STATUS_LABEL = { ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled', OVERDUE: 'Overdue', REFUNDED: 'Refunded' };

export const money = (cents) => {
  const value = (cents ?? 0) / 100;
  const hasPaisa = Math.round(Math.abs(value) * 100) % 100 !== 0;
  return `Rs ${value.toLocaleString('en-US', { minimumFractionDigits: hasPaisa ? 2 : 0, maximumFractionDigits: hasPaisa ? 2 : 0 })}`;
};

function dateTime(date, tz) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(date));
}
function calendarDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}
const formatCnic = (digits) => digits && /^\d{13}$/.test(digits) ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : digits || '';

// ---------------------------------------------------------------- drawing helpers

class Sheet {
  constructor(title) {
    this.doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, info: { Title: title, Author: 'Bizora Pilot', Creator: 'Bizora Pilot' } });
    this.doc.registerFont('latin', FONTS.latin);
    this.doc.registerFont('latinBold', FONTS.latinBold);
    this.doc.registerFont('arabic', FONTS.arabic);
    this.doc.registerFont('arabicBold', FONTS.arabicBold);
    this.width = this.doc.page.width - PAGE_MARGIN * 2;
    this.left = PAGE_MARGIN;
  }

  font(text, bold) {
    const arabic = ARABIC_SCRIPT.test(String(text));
    this.doc.font(arabic ? (bold ? 'arabicBold' : 'arabic') : (bold ? 'latinBold' : 'latin'));
    return this;
  }

  /** Text at the current position (or x/y), choosing the font by script. */
  text(value, options = {}) {
    const { bold = false, size = 9.5, color = INK, x, y, ...rest } = options;
    const str = value === null || value === undefined ? '' : String(value);
    this.font(str, bold);
    this.doc.fontSize(size).fillColor(color);
    // Arabic-script text needs the right-to-left layout feature, or words come out in the wrong order.
    const textOptions = ARABIC_SCRIPT.test(str) ? { ...rest, features: ['rtla'] } : rest;
    if (x !== undefined || y !== undefined) this.doc.text(str, x ?? this.doc.x, y ?? this.doc.y, textOptions);
    else this.doc.text(str, textOptions);
    return this;
  }

  height(value, options = {}) {
    const { bold = false, size = 9.5, width } = options;
    const str = String(value ?? '');
    this.font(str, bold);
    return this.doc.fontSize(size).heightOfString(str, { width });
  }

  ensureSpace(needed) {
    if (this.doc.y + needed > this.doc.page.height - PAGE_MARGIN) this.doc.addPage();
  }

  rule(color = LINE) {
    this.doc.moveTo(this.left, this.doc.y).lineTo(this.left + this.width, this.doc.y).lineWidth(0.7).strokeColor(color).stroke();
    this.doc.moveDown(0.6);
    return this;
  }

  gap(lines = 0.8) { this.doc.moveDown(lines); return this; }

  heading(label) {
    this.ensureSpace(40);
    this.text(label.toUpperCase(), { bold: true, size: 8, color: GOLD, characterSpacing: 1 });
    this.doc.moveDown(0.3);
    return this;
  }

  /** Two columns of label/value pairs: [[label, value], …] for left and right. */
  columns(leftRows, rightRows) {
    const colWidth = this.width / 2 - 8;
    const startY = this.doc.y;
    const draw = (rows, x) => {
      this.doc.y = startY;
      for (const [label, value] of rows) {
        if (value === undefined || value === null || value === '') continue;
        this.text(label, { size: 7.5, color: MUTED, x, width: colWidth });
        this.text(value, { size: 10, x, width: colWidth });
        this.doc.moveDown(0.35);
      }
      return this.doc.y;
    };
    const leftEnd = draw(leftRows, this.left);
    const rightEnd = draw(rightRows, this.left + this.width / 2 + 8);
    this.doc.x = this.left;
    this.doc.y = Math.max(leftEnd, rightEnd);
    return this;
  }

  /** Simple table. columns: [{ header, width (fraction), align?, value(row) }]. */
  table(columns, rows) {
    const widths = columns.map(c => c.width * this.width);
    const cellX = (i) => this.left + widths.slice(0, i).reduce((a, b) => a + b, 0);
    const headerHeight = 16;
    const drawHeader = () => {
      this.ensureSpace(headerHeight + 20);
      const y = this.doc.y;
      this.doc.rect(this.left, y, this.width, headerHeight).fill('#F1E9DC');
      columns.forEach((c, i) => this.text(c.header.toUpperCase(), { bold: true, size: 7, color: GOLD, x: cellX(i) + 4, y: y + 4, width: widths[i] - 8, align: c.align ?? 'left', lineBreak: false }));
      this.doc.y = y + headerHeight + 4;
    };
    drawHeader();
    for (const row of rows) {
      const cells = columns.map(c => String(c.value(row) ?? ''));
      const rowHeight = Math.max(...cells.map((cell, i) => this.height(cell, { size: 9, width: widths[i] - 8 }))) + 6;
      if (this.doc.y + rowHeight > this.doc.page.height - PAGE_MARGIN) { this.doc.addPage(); drawHeader(); }
      const y = this.doc.y;
      cells.forEach((cell, i) => this.text(cell, { size: 9, x: cellX(i) + 4, y, width: widths[i] - 8, align: columns[i].align ?? 'left' }));
      this.doc.y = y + rowHeight;
      this.doc.moveTo(this.left, this.doc.y - 2).lineTo(this.left + this.width, this.doc.y - 2).lineWidth(0.4).strokeColor(LINE).stroke();
    }
    this.doc.x = this.left;
    this.doc.moveDown(0.5);
    return this;
  }

  /** Right-aligned totals block: [[label, value, bold?], …]. */
  totals(rows) {
    const labelWidth = 160, valueWidth = 110;
    const x = this.left + this.width - labelWidth - valueWidth;
    for (const [label, value, bold] of rows) {
      this.ensureSpace(16);
      const y = this.doc.y;
      this.text(label, { size: bold ? 10 : 9, bold, color: bold ? INK : MUTED, x, y, width: labelWidth, lineBreak: false });
      this.text(value, { size: bold ? 11 : 9.5, bold, x: x + labelWidth, y, width: valueWidth, align: 'right', lineBreak: false });
      this.doc.y = y + (bold ? 17 : 14);
    }
    this.doc.x = this.left;
    return this;
  }

  watermark(label) {
    const { width, height } = this.doc.page;
    this.doc.save();
    this.doc.rotate(-30, { origin: [width / 2, height / 2] });
    this.doc.font('latinBold').fontSize(80).fillColor('#aa3333').opacity(0.12).text(label, 0, height / 2 - 50, { width, align: 'center' });
    this.doc.restore();
    this.doc.opacity(1);
  }

  signatures(labels) {
    this.ensureSpace(70);
    this.doc.moveDown(2.2);
    const colWidth = this.width / labels.length;
    const y = this.doc.y;
    labels.forEach((label, i) => {
      const x = this.left + colWidth * i + 10;
      this.doc.moveTo(x, y).lineTo(x + colWidth - 30, y).lineWidth(0.7).strokeColor(INK).stroke();
      this.text(label, { size: 8, color: MUTED, x, y: y + 4, width: colWidth - 30 });
    });
    this.doc.x = this.left;
    this.doc.y = y + 24;
    return this;
  }

  /** Footer lines printed inside the bottom margin of every page (call once, before the content). */
  footer(lines) {
    this.footerLines = lines;
    this.doc.on('pageAdded', () => this.drawFooter());
    this.drawFooter();
    return this;
  }

  drawFooter() {
    if (!this.footerLines) return;
    const { height, margins } = this.doc.page;
    const saved = { x: this.doc.x, y: this.doc.y, bottom: margins.bottom };
    // Writing in the margin must not trigger pdfkit's automatic page break.
    margins.bottom = 0;
    const y = height - PAGE_MARGIN + 6;
    this.doc.moveTo(this.left, y - 6).lineTo(this.left + this.width, y - 6).lineWidth(0.4).strokeColor(LINE).stroke();
    this.footerLines.forEach((line, i) => this.text(line, { size: 7, color: MUTED, x: this.left, y: y + i * 9, width: this.width, align: 'center', lineBreak: false }));
    margins.bottom = saved.bottom;
    this.doc.x = saved.x;
    this.doc.y = saved.y;
  }

  toBuffer() {
    return new Promise((resolve, reject) => {
      const chunks = [];
      this.doc.on('data', chunk => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }
}

// ---------------------------------------------------------------- shared blocks

async function agentDetails(soldBy) {
  if (soldBy.type === 'owner') return { title: 'Shop owner', name: null, id: '', role: 'Owner' };
  const employee = await Employee.findById(soldBy.id).select('name employeeId role').lean();
  return { title: 'Sales agent', name: employee?.name ?? soldBy.name, id: employee?.employeeId ?? soldBy.employeeId ?? '', role: employee?.role ?? '' };
}

function header(sheet, shop, title, meta) {
  sheet.text(shop.shopName, { bold: true, size: 18, width: sheet.width * 0.6, lineBreak: true });
  const top = sheet.doc.y;
  const details = [shop.address, [shop.phone, shop.email].filter(Boolean).join(' · '), shop.ntn ? `NTN ${shop.ntn}` : '', shop.strn ? `STRN ${shop.strn}` : ''].filter(Boolean);
  sheet.doc.y = top;
  for (const line of details) sheet.text(line, { size: 8.5, color: MUTED, width: sheet.width * 0.6 });
  const leftEnd = sheet.doc.y;
  // Right block: title and receipt metadata.
  const rightX = sheet.left + sheet.width * 0.62;
  const rightWidth = sheet.width * 0.38;
  sheet.doc.y = PAGE_MARGIN;
  sheet.text(title, { bold: true, size: 13, color: GOLD, x: rightX, width: rightWidth, align: 'right' });
  sheet.doc.moveDown(0.2);
  for (const [label, value] of meta) {
    sheet.text(`${label}: ${value}`, { size: 8.5, x: rightX, width: rightWidth, align: 'right' });
  }
  sheet.doc.x = sheet.left;
  sheet.doc.y = Math.max(leftEnd, sheet.doc.y) + 8;
  sheet.rule(GOLD);
}

function parties(sheet, { buyer, agent, shop }) {
  sheet.heading('Sold to (buyer)');
  const buyerRows = [
    ['Name', buyer.name || 'Walk-in customer'],
    ['Phone', buyer.phone],
    ['CNIC / ID', buyer.cnic],
    ['Address', buyer.address]
  ];
  const agentRows = [
    ['', ''],
    [agent.title.toUpperCase(), agent.name ? `${agent.name}${agent.id ? ` (${agent.id})` : ''}` : shop.ownerName],
    ['Role', agent.role],
    ['Business', shop.shopName]
  ];
  // The heading for the right column is drawn as the first "label" row; blank first row keeps alignment.
  sheet.columns(buyerRows, agentRows.slice(1).map(([l, v], i) => (i === 0 ? ['Sold by', v] : [l, v])));
  sheet.doc.moveDown(0.3);
  sheet.rule();
}

function itemTable(sheet, item, priceLabel, priceCents) {
  sheet.heading('Goods');
  sheet.table([
    { header: 'Description', width: 0.42, value: r => `${r.productName}\n${[r.brand, r.model].filter(Boolean).join(' · ')}${r.category ? `\n${r.category}${r.subCategory ? ` / ${r.subCategory}` : ''}` : ''}` },
    { header: 'Serial number', width: 0.2, value: r => r.serialNumber || '—' },
    { header: 'Code', width: 0.1, value: r => r.productCode || '—' },
    { header: 'Qty', width: 0.08, align: 'right', value: () => '1' },
    { header: priceLabel, width: 0.2, align: 'right', value: () => money(priceCents) }
  ], [item]);
}

function termsAndSignatures(sheet, shop, extraTerms, signatureLabels) {
  sheet.heading('Terms');
  const terms = [extraTerms, DEFAULT_TERMS, shop.receiptNote].filter(Boolean);
  for (const paragraph of terms) { sheet.text(paragraph, { size: 8, color: MUTED, width: sheet.width }); sheet.doc.moveDown(0.3); }
  sheet.signatures(signatureLabels);
}

function statusWatermark(sheet, status) {
  if (status === 'CANCELLED' || status === 'REFUNDED') sheet.watermark(status);
}

const buyerFrom = (customer) => ({ name: customer?.name ?? '', phone: customer?.phone ?? '', cnic: customer?.reference ?? '', address: customer?.address ?? '' });

async function shopDetails(shopId) {
  const shop = await Shop.findById(shopId).lean();
  if (!shop) throw notFound('Shop not found');
  return shop;
}

// ---------------------------------------------------------------- receipts

/** Receipt for one sale: a sale receipt (full price) or the installment agreement with its schedule and payments. */
export async function saleReceipt(actor, shopScope, saleId) {
  const { sale, agreement, payments } = await getSale(actor, shopScope, saleId);
  const shop = await shopDetails(shopScope._id);
  const tz = shopScope.timezone;
  const agent = await agentDetails(sale.soldBy);
  const installment = sale.type === 'INSTALLMENT' && agreement;
  const title = installment ? 'INSTALLMENT AGREEMENT & RECEIPT' : 'SALE RECEIPT';
  const sheet = new Sheet(`${title} ${sale.saleNumber}`);

  header(sheet, shop, title, [
    ['Receipt no.', sale.saleNumber],
    ...(installment ? [['Agreement no.', agreement.agreementNumber]] : []),
    ['Date', dateTime(sale.soldAt, tz)],
    ['Status', sale.status === 'COMPLETED' ? (installment ? STATUS_LABEL[agreement.displayStatus] ?? agreement.displayStatus : 'Paid') : STATUS_LABEL[sale.status] ?? sale.status]
  ]);
  sheet.footer([
    `Computer-generated by Bizora Pilot for ${shop.shopName} on ${dateTime(new Date(), tz)} (${tz}). Receipt ${sale.saleNumber}.`,
    'Amounts in Pakistani rupees. Keep this document for warranty and record purposes.'
  ]);
  statusWatermark(sheet, sale.status);
  parties(sheet, { buyer: buyerFrom(sale.customer), agent, shop });
  itemTable(sheet, sale.item, installment ? 'Agreed price' : 'Sale price', sale.salePriceCents);

  if (!installment) {
    sheet.totals([
      ['List price', money(sale.item.listPriceCents)],
      ['Discount', money(sale.discountCents)],
      ['Amount paid', money(sale.salePriceCents), true],
      ['Payment method', PAYMENT_METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod]
    ]);
    if (sale.note) { sheet.gap(0.4); sheet.text(`Note: ${sale.note}`, { size: 8.5, color: MUTED, width: sheet.width }); }
    if (sale.cancellation) { sheet.gap(0.4); sheet.text(`${sale.status === 'REFUNDED' ? 'Refunded' : 'Cancelled'} on ${dateTime(sale.cancellation.at, tz)}: ${sale.cancellation.reason}`, { size: 8.5, color: '#aa3333', width: sheet.width }); }
    sheet.gap(0.6);
    sheet.rule();
    termsAndSignatures(sheet, shop, '', ['Buyer’s signature', 'Seller’s signature']);
  } else {
    sheet.heading('Installment plan');
    sheet.columns([
      ['Total agreed price', money(agreement.totalPriceCents)],
      ['Down payment (paid at sale)', `${money(agreement.downPaymentCents)} · ${PAYMENT_METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}`],
      ['Amount financed', money(agreement.financedCents)]
    ], [
      ['Installments', `${agreement.installmentCount} × ${FREQUENCY_LABEL[agreement.frequency] ?? agreement.frequency}${agreement.frequency === 'CUSTOM' ? ` (every ${agreement.intervalDays} days)` : ''}`],
      ['First due date', calendarDate(agreement.schedule[0]?.dueDate)],
      ['Agreement date', dateTime(agreement.createdAt, tz)]
    ]);
    sheet.heading('Payment schedule');
    sheet.table([
      { header: '#', width: 0.08, value: r => r.number },
      { header: 'Due date', width: 0.3, value: r => calendarDate(r.dueDate) },
      { header: 'Amount', width: 0.22, align: 'right', value: r => money(r.amountCents) },
      { header: 'Paid', width: 0.2, align: 'right', value: r => money(r.paidCents) },
      { header: 'Status', width: 0.2, value: r => STATE_LABEL[r.state] ?? r.state }
    ], agreement.schedule);
    if (payments.length) {
      sheet.heading('Payments received');
      sheet.table([
        { header: 'Date', width: 0.3, value: r => dateTime(r.paidAt, tz) },
        { header: 'Type', width: 0.22, value: r => r.kind === 'DOWN_PAYMENT' ? 'Down payment' : 'Installment' },
        { header: 'Method', width: 0.18, value: r => PAYMENT_METHOD_LABEL[r.method] ?? r.method },
        { header: 'Received by', width: 0.3, value: r => r.recordedBy.type === 'owner' ? shop.ownerName : `${r.recordedBy.name}${r.recordedBy.employeeId ? ` (${r.recordedBy.employeeId})` : ''}` },
        { header: 'Amount', width: 0.2, align: 'right', value: r => money(r.amountCents) }
      ].map(c => ({ ...c, width: c.width / 1.2 })), payments);
    }
    sheet.totals([
      ['Total agreed price', money(agreement.totalPriceCents)],
      ['Collected so far (incl. down payment)', money(agreement.collectedCents)],
      ['Remaining balance', money(agreement.balanceCents), true],
      ...(agreement.nextDueDate ? [['Next due', `${calendarDate(agreement.nextDueDate)} · ${money(agreement.nextDueCents)}`]] : []),
      ...(agreement.overdueCents ? [['Overdue', money(agreement.overdueCents)]] : [])
    ]);
    if (agreement.notes) { sheet.gap(0.4); sheet.text(`Notes: ${agreement.notes}`, { size: 8.5, color: MUTED, width: sheet.width }); }
    if (agreement.cancellation) { sheet.gap(0.4); sheet.text(`Cancelled on ${dateTime(agreement.cancellation.at, tz)}: ${agreement.cancellation.reason}`, { size: 8.5, color: '#aa3333', width: sheet.width }); }
    sheet.gap(0.6);
    sheet.rule();
    termsAndSignatures(sheet, shop, INSTALLMENT_TERMS, ['Buyer’s signature', 'Witness', 'Seller’s signature']);
  }

  return { filename: `receipt-${sale.saleNumber}.pdf`, pdf: await sheet.toBuffer() };
}

/** Receipt for one installment payment (down payment or a later installment). */
export async function paymentReceipt(actor, shopScope, agreementId, paymentId) {
  const { agreement, sale, payments } = await getAgreement(actor, shopScope, agreementId);
  const index = payments.findIndex(p => String(p._id) === String(paymentId));
  if (index === -1) throw notFound('Payment not found');
  const payment = payments[index];
  const shop = await shopDetails(shopScope._id);
  const tz = shopScope.timezone;
  const agent = await agentDetails(payment.recordedBy);
  const receiptNumber = `${agreement.agreementNumber}/P${String(index + 1).padStart(2, '0')}`;
  const sheet = new Sheet(`PAYMENT RECEIPT ${receiptNumber}`);

  header(sheet, shop, 'INSTALLMENT PAYMENT RECEIPT', [
    ['Receipt no.', receiptNumber],
    ['Agreement no.', agreement.agreementNumber],
    ...(sale ? [['Sale no.', sale.saleNumber]] : []),
    ['Date', dateTime(payment.paidAt, tz)]
  ]);
  sheet.footer([
    `Computer-generated by Bizora Pilot for ${shop.shopName} on ${dateTime(new Date(), tz)} (${tz}). Receipt ${receiptNumber}.`,
    'Amounts in Pakistani rupees. Keep this document as proof of payment.'
  ]);
  parties(sheet, { buyer: buyerFrom(agreement.customer), agent: { ...agent, title: 'Received by' }, shop });
  sheet.heading('Payment');
  sheet.columns([
    ['Amount received', money(payment.amountCents)],
    ['Payment type', payment.kind === 'DOWN_PAYMENT' ? 'Down payment' : 'Installment'],
    ['Method', PAYMENT_METHOD_LABEL[payment.method] ?? payment.method]
  ], [
    ['Goods', `${agreement.item.productName}${agreement.item.serialNumber ? ` · S/N ${agreement.item.serialNumber}` : ''}`],
    ['Note', payment.note]
  ]);
  const collectedAfter = payments.slice(0, index + 1).reduce((sum, p) => sum + p.amountCents, 0);
  sheet.rule();
  sheet.totals([
    ['Total agreed price', money(agreement.totalPriceCents)],
    ['Collected up to this payment', money(collectedAfter)],
    ['Balance after this payment', money(agreement.totalPriceCents - collectedAfter), true],
    ['Current balance', money(agreement.balanceCents)],
    ...(agreement.nextDueDate ? [['Next due', `${calendarDate(agreement.nextDueDate)} · ${money(agreement.nextDueCents)}`]] : [])
  ]);
  sheet.gap(0.6);
  sheet.rule();
  termsAndSignatures(sheet, shop, '', ['Buyer’s signature', 'Received by']);
  return { filename: `payment-${receiptNumber.replace(/\//g, '-')}.pdf`, pdf: await sheet.toBuffer() };
}

export const formatCnicForReceipt = formatCnic;
