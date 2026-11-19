import mongoose from 'mongoose';
import { actorSchema } from './actor.js';

export const DOCUMENT_KINDS = ['CNIC_FRONT', 'CNIC_BACK', 'OTHER'];

/**
 * A shop's customer: who bought (or is paying off) a unit. Sales keep their own copy of the
 * customer's details at the time of sale; this record is the living one (phone changes, new
 * address) and the place the CNIC pictures hang off. One record per shop per person; the
 * CNIC is unique within a shop when it's known.
 */
const customerSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  /** Human-readable ID, unique within the shop (C-0001). */
  customerCode: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 40 },
  /** Digits of the phone, for matching "0301-1234567" with "03011234567". */
  phoneKey: { type: String, default: '' },
  /** 13 digits, stored without dashes; '' when unknown. */
  cnic: { type: String, default: '' },
  address: { type: String, trim: true, maxlength: 300, default: '' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  /** Pictures of the customer's ID card. The bytes live in CustomerDocument; this is the list. */
  documents: [{
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: actorSchema, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdBy: { type: actorSchema, required: true }
}, { timestamps: true });

customerSchema.index({ shopId: 1, customerCode: 1 }, { unique: true });
// A CNIC identifies one person per shop. Partial so customers without a known CNIC don't collide.
customerSchema.index({ shopId: 1, cnic: 1 }, { unique: true, partialFilterExpression: { cnic: { $type: 'string', $gt: '' } } });
customerSchema.index({ shopId: 1, phoneKey: 1 });
customerSchema.index({ shopId: 1, updatedAt: -1, _id: -1 });
customerSchema.index({ shopId: 1, name: 1, _id: 1 }, { collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Customer', customerSchema);
