import mongoose from 'mongoose';
import { FEATURE_KEYS } from '../config/features.js';

/** A plan a shop can be on. Prices in integer paisa; `null` limits mean unlimited. */
const subscriptionPlanSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  priceCents: { type: Number, min: 0, default: 0 },
  billingPeriod: { type: String, enum: ['MONTH', 'YEAR'], default: 'MONTH' },
  trialDays: { type: Number, min: 0, default: 0 },
  limits: {
    maxEmployees: { type: Number, min: 0, default: null },
    maxInventoryUnits: { type: Number, min: 0, default: null },
    maxBranches: { type: Number, min: 0, default: null }
  },
  features: { type: [{ type: String, enum: FEATURE_KEYS }], default: [] },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('SubscriptionPlan', subscriptionPlanSchema, 'subscription_plans');
