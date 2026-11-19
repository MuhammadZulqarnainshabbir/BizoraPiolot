import mongoose from 'mongoose';
import { FEATURE_KEYS } from '../config/features.js';

/** A platform-authorised exception to a shop's plan: a feature switched on or off for that shop only. */
const featureOverrideSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  featureKey: { type: String, enum: FEATURE_KEYS, required: true },
  enabled: { type: Boolean, required: true },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin' }
}, { timestamps: true });

featureOverrideSchema.index({ shopId: 1, featureKey: 1 }, { unique: true });

export default mongoose.model('FeatureOverride', featureOverrideSchema, 'feature_overrides');
