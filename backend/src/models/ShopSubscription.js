import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUSES } from '../config/features.js';

/**
 * Which plan a shop is on. One record per shop; shops without one use the platform's default
 * plan. No payment provider is integrated: `billingReference` and `notes` are for the business
 * to record what was agreed and paid elsewhere.
 */
const shopSubscriptionSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, unique: true },
  planKey: { type: String, required: true, uppercase: true },
  status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'ACTIVE' },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  billingReference: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin' }
}, { timestamps: true });

shopSubscriptionSchema.index({ planKey: 1, status: 1 });

export default mongoose.model('ShopSubscription', shopSubscriptionSchema, 'shop_subscriptions');
