import mongoose from 'mongoose';
import { actorSchema } from './actor.js';

/**
 * Permanent record of owner corrections: inventory edits and deletions, sale cancellations
 * and refunds, installment cancellations. Written in the same transaction as the change.
 */
const auditLogSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  actor: { type: actorSchema, required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  reason: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ shopId: 1, createdAt: -1 });
auditLogSchema.index({ shopId: 1, entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
