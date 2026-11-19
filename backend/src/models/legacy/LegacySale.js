import mongoose from 'mongoose';

// All money is stored as integer cents so balances can be updated atomically with $inc
// without floating-point drift.

const actorSchema = new mongoose.Schema({
  type: { type: String, enum: ['owner', 'employee'], required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  employeeId: { type: String, default: '' }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['full', 'down-payment', 'installment'], required: true },
  amountCents: { type: Number, required: true, min: 1 },
  paidAt: { type: Date, default: Date.now },
  note: { type: String, trim: true, maxlength: 300, default: '' },
  recordedBy: { type: actorSchema, required: true }
});

const scheduleEntrySchema = new mongoose.Schema({
  dueDate: { type: Date, required: true },
  amountCents: { type: Number, required: true, min: 1 }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  saleNumber: { type: String, required: true },
  // Snapshot of the product at the time of sale, so later edits/deletes don't rewrite history.
  item: {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    unitPriceCents: { type: Number, required: true, min: 0 }
  },
  quantity: { type: Number, required: true, min: 1 },
  totalCents: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['full', 'installment'], required: true },
  customer: {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' }
  },
  installment: {
    downPaymentCents: { type: Number, min: 0 },
    count: { type: Number, min: 1 },
    schedule: { type: [scheduleEntrySchema], default: undefined }
  },
  payments: { type: [paymentSchema], default: [] },
  paidCents: { type: Number, required: true, min: 0 },
  balanceCents: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['open', 'paid'], required: true },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  soldBy: { type: actorSchema, required: true }
}, { timestamps: true });

saleSchema.index({ shopId: 1, saleNumber: 1 }, { unique: true });
saleSchema.index({ shopId: 1, createdAt: -1, _id: -1 });
saleSchema.index({ shopId: 1, status: 1, createdAt: -1 });

// Old quantity-based sales (collection 'sales'). Read only by the serialized-inventory migration;
// kept untouched as a backup.
export default mongoose.model('LegacySale', saleSchema, 'sales');
