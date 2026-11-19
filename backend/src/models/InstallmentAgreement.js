import mongoose from 'mongoose';
import { actorSchema, customerSchema } from './actor.js';

export const AGREEMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'];
export const FREQUENCIES = ['MONTHLY', 'WEEKLY', 'CUSTOM'];

/**
 * An installment plan for one sold unit. "Overdue" isn't stored: it's an ACTIVE agreement
 * whose `nextDueDate` is before today in the shop's timezone, so it can't go stale.
 * Due dates are calendar dates (YYYY-MM-DD in the shop's timezone).
 */
const agreementSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  agreementNumber: { type: String, required: true },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryUnit' },
  item: {
    productName: { type: String, required: true },
    serialNumber: { type: String, default: '' }
  },
  /** The customer record (see models/Customer.js); `customer` is the snapshot at sale time. */
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customer: { type: customerSchema, required: true },
  totalPriceCents: { type: Number, min: 0, required: true },
  downPaymentCents: { type: Number, min: 0, required: true },
  financedCents: { type: Number, min: 0, required: true },
  installmentCount: { type: Number, min: 1, required: true },
  frequency: { type: String, enum: FREQUENCIES, required: true },
  /** Days between installments when frequency is CUSTOM. */
  intervalDays: { type: Number, min: 1 },
  schedule: [{
    _id: false,
    number: { type: Number, required: true },
    dueDate: { type: String, required: true },
    amountCents: { type: Number, min: 0, required: true }
  }],
  /** Everything received, including the down payment (counted once). */
  collectedCents: { type: Number, min: 0, required: true },
  balanceCents: { type: Number, min: 0, required: true },
  nextDueDate: { type: String, default: null },
  nextDueCents: { type: Number, default: null },
  status: { type: String, enum: AGREEMENT_STATUSES, default: 'ACTIVE' },
  soldBy: { type: actorSchema, required: true },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  cancellation: { at: Date, by: actorSchema, reason: String }
}, { timestamps: true });

agreementSchema.index({ shopId: 1, agreementNumber: 1 }, { unique: true });
agreementSchema.index({ shopId: 1, createdAt: -1, _id: -1 });
agreementSchema.index({ shopId: 1, status: 1, nextDueDate: 1 });
agreementSchema.index({ shopId: 1, 'soldBy.id': 1, createdAt: -1 });
agreementSchema.index({ shopId: 1, customerId: 1, createdAt: -1 });
agreementSchema.index({ saleId: 1 }, { unique: true });

export default mongoose.model('InstallmentAgreement', agreementSchema);
