import mongoose from 'mongoose';
const shopSchema = new mongoose.Schema({
  shopName: { type: String, required: true, trim: true },
  ownerName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  /** IANA timezone used for "today", reports and installment due dates. Times are stored in UTC. */
  timezone: { type: String, trim: true, default: 'Asia/Karachi' },
  /** Short public code employees type on the mobile app to pick their shop (services/shopCodes.js). */
  shopCode: { type: String, trim: true, uppercase: true },
  /**
   * Platform lifecycle (config/features.js SHOP_STATUSES). Only ACTIVE shops can sign in or call
   * shop APIs; records are kept whatever the status. Changed only by platform admins (audited).
   */
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'], default: 'ACTIVE' },
  statusReason: { type: String, trim: true, maxlength: 500, default: '' },
  statusChangedAt: { type: Date },
  statusChangedBy: { type: String, default: '' },
  /** Last owner or employee sign-in / renewal. */
  lastActivityAt: { type: Date },
  /** Printed on receipts: National Tax Number and Sales Tax Registration Number (optional), and the shop's own terms. */
  ntn: { type: String, trim: true, maxlength: 30, default: '' },
  strn: { type: String, trim: true, maxlength: 30, default: '' },
  receiptNote: { type: String, trim: true, maxlength: 1000, default: '' },
  passwordHash: { type: String, required: true, select: false },
  resetPasswordTokenHash: { type: String, select: false },
  resetPasswordExpiresAt: { type: Date, select: false },
  // Per-shop counters for human-readable numbers. Incremented atomically (inside transactions
  // where used, so an aborted sale doesn't consume a number).
  employeeSeq: { type: Number, default: 0, select: false },
  saleSeq: { type: Number, default: 0, select: false },
  productSeq: { type: Number, default: 0, select: false },
  agreementSeq: { type: Number, default: 0, select: false },
  customerSeq: { type: Number, default: 0, select: false }
}, { timestamps: true });
// Partial so shops created before codes existed (backfilled at startup) don't collide on null.
shopSchema.index({ shopCode: 1 }, { unique: true, partialFilterExpression: { shopCode: { $type: 'string' } } });
shopSchema.index({ status: 1, createdAt: -1 });
shopSchema.index({ createdAt: -1 });
export default mongoose.model('Shop', shopSchema);
