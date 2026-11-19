import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  sku: { type: String, trim: true, maxlength: 60, default: '' },
  // Chosen from config/productCategories.js. Products created before the list existed may hold free text.
  category: { type: String, trim: true, maxlength: 80, default: '' },
  subCategory: { type: String, trim: true, maxlength: 80, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: true });

// List sorting indexes. Each ends in _id because the list query uses _id as a
// tie-breaker; MongoDB walks them in reverse for the opposite sort direction.
inventoryItemSchema.index({ shopId: 1, updatedAt: -1, _id: -1 });
inventoryItemSchema.index({ shopId: 1, name: 1, _id: 1 }, { collation: { locale: 'en', strength: 2 } });
inventoryItemSchema.index({ shopId: 1, quantity: 1, _id: 1 });
inventoryItemSchema.index({ shopId: 1, price: 1, _id: 1 });

// Old quantity-based stock (collection 'inventoryitems'). Read only by the serialized-inventory migration;
// kept untouched as a backup.
export default mongoose.model('LegacyInventoryItem', inventoryItemSchema, 'inventoryitems');
