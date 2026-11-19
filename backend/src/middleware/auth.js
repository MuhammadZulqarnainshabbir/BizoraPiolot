import jwt from 'jsonwebtoken';
import { can, effectivePermissions } from '../config/permissions.js';
import Employee from '../models/Employee.js';
import { SESSION_EXPIRED_MESSAGE } from '../services/sessionTokens.js';

/** Returns the token payload, or a response-ready error: missing, expired or invalid. */
function verifyBearer(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return { error: 'Authentication required' };
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Platform console tokens carry an audience and a 'platform-admin' role; they never open shop endpoints.
    if (payload.aud || payload.role === 'platform-admin') return { error: 'Invalid or expired token' };
    return { payload };
  } catch (err) {
    return { error: err.name === 'TokenExpiredError' ? SESSION_EXPIRED_MESSAGE : 'Invalid or expired token' };
  }
}

/** Owner payload → request context. Tokens issued before roles existed have no role and are owner tokens. */
function asOwner(req, payload) {
  req.tokenPayload = payload;
  req.shopId = payload.sub;
  req.actor = { type: 'owner', id: payload.sub, name: 'Shop owner' };
}

/**
 * Employee payload → request context. Checks the database on every request so deactivating,
 * deleting or resetting an employee's password takes effect immediately, and resolves the
 * account's current access role and permissions (so promotions, demotions and permission
 * changes apply on the next request, not at token expiry).
 * Returns an error response ({ status, body }) or null.
 */
async function asEmployee(req, payload, { allowPendingPasswordChange = false } = {}) {
  const employee = await Employee.findOne({ _id: payload.sub, shopId: payload.shopId }).select('+tokenVersion');
  if (!employee || employee.tokenVersion !== payload.ver) {
    return { status: 401, body: { message: 'Your session has ended. Please log in again.' } };
  }
  if (employee.status !== 'active') {
    return { status: 403, body: { message: 'This employee account is inactive. Contact the shop owner.' } };
  }
  if (employee.mustChangePassword && !allowPendingPasswordChange) {
    return { status: 403, body: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password to continue.' } };
  }
  req.tokenPayload = payload;
  req.employee = employee;
  req.shopId = String(employee.shopId);
  req.actor = {
    type: 'employee', id: employee._id, name: employee.name, employeeId: employee.employeeId,
    accessRole: employee.accessRole ?? 'employee', permissions: effectivePermissions(employee)
  };
  return null;
}

/** Shop owner only. */
export function requireAuth(req, res, next) {
  const { payload, error } = verifyBearer(req);
  if (error) return res.status(401).json({ message: error });
  if (payload.role && payload.role !== 'owner') return res.status(401).json({ message: 'Invalid or expired token' });
  asOwner(req, payload);
  next();
}

/** Employee only. */
export function requireEmployee(options = {}) {
  return async (req, res, next) => {
    const { payload, error } = verifyBearer(req);
    if (error) return res.status(401).json({ message: error });
    if (payload.role !== 'employee') return res.status(401).json({ message: 'Invalid or expired token' });
    try {
      const failure = await asEmployee(req, payload, options);
      if (failure) return res.status(failure.status).json(failure.body);
      next();
    } catch (err) { next(err); }
  };
}

/** Owner or employee. Sets req.actor ({ type, id, name, employeeId }) and req.shopId from the token. */
export async function authenticate(req, res, next) {
  const { payload, error } = verifyBearer(req);
  if (error) return res.status(401).json({ message: error });
  try {
    if (payload.role === 'employee') {
      const failure = await asEmployee(req, payload);
      if (failure) return res.status(failure.status).json(failure.body);
    } else if (!payload.role || payload.role === 'owner') {
      asOwner(req, payload);
    } else {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    next();
  } catch (err) { next(err); }
}

/** Requires every listed permission (see config/permissions.js). Use after `authenticate`. */
export const authorize = (...permissions) => (req, res, next) => {
  if (permissions.every(p => can(req.actor, p))) return next();
  return res.status(403).json({ code: 'FORBIDDEN', message: 'You don’t have permission to do that' });
};
