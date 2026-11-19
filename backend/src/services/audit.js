import AuditLog from '../models/AuditLog.js';

/** Writes an audit entry inside the caller's transaction, so the log and the change commit together. */
export async function audit(session, { shopId, actor, action, entityType, entityId, before, after, reason = '' }) {
  await AuditLog.create([{ shopId, actor, action, entityType, entityId, before, after, reason }], { session });
}
