import mongoose from 'mongoose';

/** Platform-wide settings: one document (key 'default'). */
const platformSettingSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  /** 'automatic': new shops are ACTIVE at once. 'manual': they start PENDING until a platform admin approves. */
  registrationApproval: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  /** Plan used for shops without a subscription record. */
  defaultPlanKey: { type: String, default: 'FREE_TRIAL' },
  /** Shown to shop users while their shop is suspended. */
  suspensionMessage: { type: String, trim: true, maxlength: 300, default: 'This shop has been suspended by Bizora. Please contact support.' },
  supportEmail: { type: String, trim: true, maxlength: 254, default: '' }
}, { timestamps: true });

export default mongoose.model('PlatformSetting', platformSettingSchema, 'platform_settings');
