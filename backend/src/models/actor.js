import mongoose from 'mongoose';

/**
 * Who did something: the shop owner or one of its employees. Stored on every inventory unit,
 * sale, payment and audit entry. `name` / `employeeId` are copies taken at the time, so
 * records stay readable if the employee is later renamed or removed.
 */
export const actorSchema = new mongoose.Schema({
  type: { type: String, enum: ['owner', 'employee'], required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  employeeId: { type: String, default: '' }
}, { _id: false });

export const customerSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  address: { type: String, trim: true, maxlength: 300, default: '' },
  /** Optional ID / reference (e.g. CNIC). Visible only to the owner and the selling employee. */
  reference: { type: String, trim: true, maxlength: 60, default: '' }
}, { _id: false });

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];
