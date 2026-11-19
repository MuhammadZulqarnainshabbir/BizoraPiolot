import PlatformAuditLog from '../../models/PlatformAuditLog.js';

/**
 * Records a platform action. Called after the change committed (or, for failed sign-ins,
 * immediately). Never store passwords, tokens or secrets in `before`/`after`.
 */
export async function platformAudit(req, { action, targetType = '', targetId = '', targetLabel = '', reason = '', before, after, outcome = 'success', adminEmail }) {
  try {
    await PlatformAuditLog.create({
      adminId: req.platformAdmin?._id,
      adminEmail: adminEmail ?? req.platformAdmin?.email ?? '',
      action, targetType, targetId: targetId ? String(targetId) : '', targetLabel, reason, before, after, outcome,
      ip: req.ip ?? '', requestId: req.id ?? ''
    });
  } catch (err) {
    // The audit log must never break the request; it is reported instead.
    console.error('Platform audit write failed:', err.message);
  }
}
