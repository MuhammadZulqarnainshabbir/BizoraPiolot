import mongoose from 'mongoose';
import { PAYMENT_METHODS, actorSchema } from './actor.js';

/** Money received on an installment agreement: the down payment, then each installment. */
const paymentSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  agreementId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentAgreement', required: true },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  kind: { type: String, enum: ['DOWN_PAYMENT', 'INSTALLMENT'], required: true },
  amountCents: { type: Number, min: 1, required: true },
  method: { type: String, enum: PAYMENT_METHODS, required: true },
  /** Set by the server. */
  paidAt: { type: Date, required: true },
  recordedBy: { type: actorSchema, required: true },
  note: { type: String, trim: true, maxlength: 300, default: '' }
}, { timestamps: true });

paymentSchema.index({ agreementId: 1, paidAt: 1 });
paymentSchema.index({ shopId: 1, paidAt: -1 });

export default mongoose.model('InstallmentPayment', paymentSchema);
