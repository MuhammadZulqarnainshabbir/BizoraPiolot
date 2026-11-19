import mongoose from 'mongoose';
import { actorSchema } from './actor.js';

/** Normalised key used to recognise the same brand / model regardless of case and spacing. */
export const catalogKey = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Catalog entry: the details shared by every unit of one model (e.g. "Samsung Galaxy S25").
 * Physical units with serial numbers are InventoryUnit documents pointing here.
 */
const productSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  /** Human-readable product ID, unique within the shop (P-0001). */
  productCode: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  brand: { type: String, required: true, trim: true, maxlength: 60 },
  model: { type: String, required: true, trim: true, maxlength: 80 },
  brandKey: { type: String, required: true },
  modelKey: { type: String, required: true },
  category: { type: String, trim: true, maxlength: 80, default: '' },
  subCategory: { type: String, trim: true, maxlength: 80, default: '' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  /** Optional image links (https). */
  imageUrls: { type: [String], default: [] },
  createdBy: { type: actorSchema, required: true },
  /** Created by the serialized-inventory migration from an old quantity-based product. */
  legacyInventoryItemId: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

productSchema.index({ shopId: 1, brandKey: 1, modelKey: 1 }, { unique: true });
productSchema.index({ shopId: 1, productCode: 1 }, { unique: true });
productSchema.index({ shopId: 1, updatedAt: -1, _id: -1 });

export default mongoose.model('Product', productSchema);
