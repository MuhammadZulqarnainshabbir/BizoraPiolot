import mongoose from 'mongoose';

/**
 * The bytes of a customer's ID picture (CNIC front/back). Kept apart from the Customer record so
 * listing customers never loads images. Served only through the authenticated customers API,
 * never as a public file: an ID card is sensitive.
 */
const customerDocumentSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

customerDocumentSchema.index({ shopId: 1, customerId: 1 });

export default mongoose.model('CustomerDocument', customerDocumentSchema);
