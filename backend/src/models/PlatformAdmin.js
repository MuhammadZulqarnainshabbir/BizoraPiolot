import mongoose from 'mongoose';
import { PLATFORM_ROLES } from '../config/platformPermissions.js';

/**
 * A Bizora staff account for the platform console. Separate from shops and employees: a
 * platform admin has no shopId, signs in through /platform-admin/auth, and its token carries
 * the 'platform' audience, which every shop endpoint rejects.
 */
const platformAdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, enum: PLATFORM_ROLES, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  passwordHash: { type: String, required: true, select: false },
  /** Set by provisioning and password resets; the admin must choose their own password first. */
  mustChangePassword: { type: Boolean, default: true },
  /** Bumped on logout, password change, deactivation or "revoke sessions": older tokens stop working at once. */
  tokenVersion: { type: Number, default: 0, select: false },
  mfa: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, select: false },
    enabledAt: { type: Date }
  },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  lastLoginAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin' }
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.tokenVersion;
      delete ret.__v;
      if (ret.mfa) delete ret.mfa.secret;
      return ret;
    }
  }
});

export default mongoose.model('PlatformAdmin', platformAdminSchema, 'platform_admins');
