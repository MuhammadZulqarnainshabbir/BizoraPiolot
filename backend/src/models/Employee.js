import mongoose from 'mongoose';
import { ACCESS_ROLES } from '../config/permissions.js';
import { actorSchema } from './actor.js';

const employeeSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  // Human-readable login ID, unique within the shop (e.g. EMP-0001). Assigned from Shop.employeeSeq.
  employeeId: { type: String, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  /** Job title shown to people ("Sales associate"). Access is decided by `accessRole`, not by this. */
  role: { type: String, required: true, trim: true, maxlength: 80 },
  /** What the account may do: 'employee' (fixed set) or 'manager' (operational defaults + owner's overrides). See config/permissions.js. */
  accessRole: { type: String, enum: ACCESS_ROLES, default: 'employee' },
  /** Owner's per-manager adjustments; only grantable permissions are honoured. Cleared on demotion. */
  permissionOverrides: {
    allow: { type: [String], default: [] },
    deny: { type: [String], default: [] }
  },
  permissionsUpdatedAt: { type: Date },
  permissionsUpdatedBy: { type: actorSchema },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  passwordHash: { type: String, select: false },
  mustChangePassword: { type: Boolean, default: true },
  // Bumped whenever the password changes so previously issued employee tokens stop working.
  tokenVersion: { type: Number, default: 0, select: false }
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.tokenVersion;
      delete ret.__v;
      return ret;
    }
  }
});

employeeSchema.index({ shopId: 1, email: 1 }, { unique: true });
// Partial so employees created before IDs existed (no employeeId yet) don't collide on null.
employeeSchema.index({ shopId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'string' } } });
// List sorting indexes; see InventoryItem.js for why each ends in _id.
employeeSchema.index({ shopId: 1, updatedAt: -1, _id: -1 });
employeeSchema.index({ shopId: 1, accessRole: 1 });
employeeSchema.index({ shopId: 1, name: 1, _id: 1 }, { collation: { locale: 'en', strength: 2 } });
employeeSchema.index({ shopId: 1, role: 1, _id: 1 }, { collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Employee', employeeSchema);
