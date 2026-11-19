import mongoose from 'mongoose';
import { actorSchema } from './actor.js';

export const UNIT_STATUSES = ['AVAILABLE', 'SOLD_FULL_PRICE', 'SOLD_INSTALLMENT'];

/**
 * Serial numbers are matched ignoring case and whitespace ("sam 001" == "SAM001"), but stored
 * exactly as typed. Strings, so leading zeros are kept.
 */
export const serialKey = (serial) => String(serial ?? '').replace(/\s+/g, '').toUpperCase();

/** One physical unit in stock, identified by its serial number. */
const inventoryUnitSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNumber: { type: String, required: true, trim: true, maxlength: 100 },
  serialKey: { type: String, required: true },
  /** Migrated from old quantity-based stock with a placeholder serial; can't be sold until corrected. */
  serialPending: { type: Boolean, default: false },
  // Copies of the catalog fields, so units can be listed and searched without a join.
  // Kept in sync when the owner edits the product.
  productCode: { type: String, required: true },
  productName: { type: String, required: true },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  category: { type: String, default: '' },
  subCategory: { type: String, default: '' },
  /** Cost. Owner-only: never returned to employees. Null only for migrated legacy stock. */
  purchasePriceCents: { type: Number, min: 0, default: null },
  sellingPriceCents: { type: Number, required: true, min: 0 },
  supplier: {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    invoiceRef: { type: String, trim: true, maxlength: 60, default: '' }
  },
  status: { type: String, enum: UNIT_STATUSES, default: 'AVAILABLE' },
  addedBy: { type: actorSchema, required: true },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  soldAt: { type: Date }
}, { timestamps: true });

// A serial number can exist only once per shop. Enforced by the database, not just the API.
inventoryUnitSchema.index({ shopId: 1, serialKey: 1 }, { unique: true });
inventoryUnitSchema.index({ shopId: 1, createdAt: -1, _id: -1 });
inventoryUnitSchema.index({ shopId: 1, status: 1, createdAt: -1, _id: -1 });
inventoryUnitSchema.index({ shopId: 1, productId: 1, status: 1 });
inventoryUnitSchema.index({ shopId: 1, 'addedBy.id': 1, createdAt: -1 });

export default mongoose.model('InventoryUnit', inventoryUnitSchema);
