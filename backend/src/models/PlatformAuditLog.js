import mongoose from 'mongoose';

/**
 * Every platform write (and every sign-in attempt) is recorded here. Kept apart from the shops'
 * own audit log so platform activity never mixes with a shop's business history.
 */
const platformAuditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin' },
  adminEmail: { type: String, default: '' },
  action: { type: String, required: true },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  /** Shop name or admin name at the time, so the log reads without joins. */
  targetLabel: { type: String, default: '' },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String, default: '' },
  requestId: { type: String, default: '' },
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' }
}, { timestamps: { createdAt: true, updatedAt: false } });

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ adminId: 1, createdAt: -1 });
platformAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
platformAuditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model('PlatformAuditLog', platformAuditLogSchema, 'platform_audit_logs');
