import mongoose from 'mongoose';
import { PAYMENT_METHODS, actorSchema, customerSchema } from './actor.js';

export const SALE_TYPES = ['FULL_PRICE', 'INSTALLMENT'];
export const SALE_STATUSES = ['COMPLETED', 'CANCELLED', 'REFUNDED'];

/**
 * One sold inventory unit. Product and price details are copied at the time of sale, so the
 * record stays accurate when the catalog changes. Money is integer paisa (cents).
 *
 * Stored in the `sale_records` collection; the old quantity-based `sales` collection is kept
 * untouched as a backup and read only by the migration (see models/legacy).
 */
const saleSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  saleNumber: { type: String, required: true },
  type: { type: String, enum: SALE_TYPES, required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryUnit' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  item: {
    productCode: { type: String, default: '' },
    productName: { type: String, required: true },
    brand: { type: String, default: '' },
    model: { type: String, default: '' },
    category: { type: String, default: '' },
    subCategory: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    serialKey: { type: String, default: '' },
    /** The unit's selling price when it was sold. */
    listPriceCents: { type: Number, min: 0, required: true },
    /** Owner-only. */
    purchasePriceCents: { type: Number, min: 0, default: null }
  },
  /** Full price: the amount actually charged. Installment: the total agreed price. */
  salePriceCents: { type: Number, min: 0, required: true },
  discountCents: { type: Number, min: 0, default: 0 },
  /** Full price: how it was paid. Installment: how the down payment was paid. */
  paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
  /** The customer record this sale belongs to, when known. `customer` below is the snapshot at sale time. */
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customer: { type: customerSchema, default: () => ({}) },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  soldBy: { type: actorSchema, required: true },
  /** Set by the server, never by the client. */
  soldAt: { type: Date, required: true },
  status: { type: String, enum: SALE_STATUSES, default: 'COMPLETED' },
  cancellation: {
    at: Date,
    by: actorSchema,
    reason: { type: String, trim: true, maxlength: 500 }
  },
  installmentAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentAgreement' },
  /** Migrated from the old quantity-based sales (no serial number, possibly several units). */
  legacy: {
    saleId: mongoose.Schema.Types.ObjectId,
    quantity: Number
  }
}, { timestamps: true });

saleSchema.index({ shopId: 1, saleNumber: 1 }, { unique: true });
saleSchema.index({ shopId: 1, type: 1, soldAt: -1, _id: -1 });
saleSchema.index({ shopId: 1, 'soldBy.id': 1, type: 1, soldAt: -1 });
saleSchema.index({ shopId: 1, 'item.serialKey': 1 });
saleSchema.index({ shopId: 1, customerId: 1, soldAt: -1 });
// A unit can have at most one completed sale.
saleSchema.index({ unitId: 1 }, { unique: true, partialFilterExpression: { unitId: { $exists: true }, status: 'COMPLETED' } });

export default mongoose.model('Sale', saleSchema, 'sale_records');
