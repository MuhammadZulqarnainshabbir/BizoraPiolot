import bcrypt from 'bcryptjs';
import { assertWithinLimit } from '../middleware/entitlements.js';
import AuditLog from '../models/AuditLog.js';
import Employee from '../models/Employee.js';
import { JOB_ROLES, isJobRole } from '../config/jobRoles.js';
import { can, effectivePermissions, grantablePermissions, permissionRegistry as registry, permissionsFor, validateOverrides } from '../config/permissions.js';
import { audit } from '../services/audit.js';
import { nextEmployeeId } from '../services/sequences.js';
import { inTransaction } from '../utils/http.js';
import { listPage } from '../utils/listing.js';
import { emailPattern, handleDataError, isObjectId, isPassword, isText, validationError } from '../utils/validation.js';

// Team management (/api/v1/employees). Owner-only writes; managers with employees.view may read.

const EMPLOYEE_LIST = {
  sortFields: ['updatedAt', 'name', 'role'],
  textSortFields: ['name', 'role'],
  searchFields: ['name', 'email', 'role', 'employeeId']
};

const PASSWORD_MESSAGE = 'Temporary password must be 8–128 characters';
const HISTORY_LIMIT = 50;

function validEmployee(body) {
  const email = body.email;
  return isText(body.name, { required: true, max: 120 })
    && isText(email, { required: true, max: 254 })
    && emailPattern.test(email.trim())
    && isText(body.phone ?? '', { max: 40 })
    && isJobRole(body.role)
    && (body.status === undefined || body.status === 'active' || body.status === 'inactive');
}

/** The job titles offered in the Role dropdown (config/jobRoles.js). */
export const listRoles = (_req, res) => res.json({ roles: [...JOB_ROLES] });

function employeeValues(body) {
  return {
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: (body.phone ?? '').trim(),
    role: body.role.trim(),
    status: body.status ?? 'active'
  };
}

/** What the team list shows. Managers (not owners) don't see other accounts' permission overrides. */
function teamView(employee, actor) {
  const view = typeof employee.toObject === 'function' ? employee.toObject() : { ...employee };
  delete view.passwordHash;
  delete view.tokenVersion;
  delete view.__v;
  view.accessRole = view.accessRole ?? 'employee';
  if (!can(actor, 'employees.managePermissions')) {
    delete view.permissionOverrides;
    delete view.permissionsUpdatedAt;
    delete view.permissionsUpdatedBy;
  }
  return view;
}

/** The permission picture for one employee: role defaults, what's configurable, overrides and the result. */
function permissionView(employee) {
  const accessRole = employee.accessRole ?? 'employee';
  return {
    accessRole,
    defaults: permissionsFor(accessRole),
    grantable: accessRole === 'manager' ? grantablePermissions() : [],
    overrides: { allow: employee.permissionOverrides?.allow ?? [], deny: employee.permissionOverrides?.deny ?? [] },
    effective: effectivePermissions(employee),
    updatedAt: employee.permissionsUpdatedAt ?? null,
    updatedBy: employee.permissionsUpdatedBy ?? null
  };
}

export const permissionRegistry = (_req, res) => res.json({ permissions: registry(), grantable: grantablePermissions(), defaults: { owner: permissionsFor('owner'), manager: permissionsFor('manager'), employee: permissionsFor('employee') } });

export async function listEmployees(req, res, next) {
  try {
    const { records, ...pagination } = await listPage(Employee, req.shopId, req.query, EMPLOYEE_LIST);
    return res.json({ employees: records.map(e => teamView(e, req.actor)), ...pagination });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

export async function listManagers(req, res, next) {
  try {
    const { records, ...pagination } = await listPage(Employee, req.shopId, req.query, EMPLOYEE_LIST, { accessRole: 'manager' });
    return res.json({ employees: records.map(e => teamView(e, req.actor)), ...pagination });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

/** Owner creates an employee, or a manager straight away with `accessRole: 'manager'` (and optional overrides). */
export async function createEmployee(req, res, next) {
  const body = req.body || {};
  if (!validEmployee(body)) return validationError(res, 'Provide a valid name, email, and a role from the list');
  if (!isPassword(body.password)) return validationError(res, PASSWORD_MESSAGE);
  const accessRole = body.accessRole ?? 'employee';
  if (accessRole !== 'employee' && accessRole !== 'manager') return validationError(res, 'Access role must be employee or manager');
  let overrides = { allow: [], deny: [] };
  if (accessRole === 'manager' && body.permissionOverrides !== undefined) {
    try { overrides = validateOverrides(body.permissionOverrides); } catch (err) { return validationError(res, err.message); }
  }
  if (accessRole === 'manager' && req.entitlements && !req.entitlements.features.includes('manager_role')) {
    return res.status(403).json({ code: 'FEATURE_NOT_AVAILABLE', message: `The manager role isn’t included in the shop’s plan (${req.entitlements.planName})` });
  }
  try {
    const values = employeeValues(body);
    if (req.entitlements) assertWithinLimit(req.entitlements, 'maxEmployees', await Employee.countDocuments({ shopId: req.shopId }), 1, 'Employee');
    if (await Employee.exists({ shopId: req.shopId, email: values.email })) {
      return res.status(409).json({ message: 'Employee email already exists for this shop' });
    }
    const employee = await inTransaction(async (session) => {
      const [employeeId, passwordHash] = await Promise.all([nextEmployeeId(req.shopId, session), bcrypt.hash(body.password, 12)]);
      const [created] = await Employee.create([{
        shopId: req.shopId, ...values, employeeId, passwordHash, mustChangePassword: true, accessRole, permissionOverrides: overrides,
        ...(accessRole === 'manager' ? { permissionsUpdatedAt: new Date(), permissionsUpdatedBy: req.actor } : {})
      }], { session });
      if (accessRole === 'manager') {
        await audit(session, { shopId: req.shopId, actor: req.actor, action: 'MANAGER_CREATED', entityType: 'Employee', entityId: created._id, after: { accessRole, overrides, effective: effectivePermissions(created) } });
      }
      return created;
    });
    return res.status(201).json({ employee: teamView(employee, req.actor) });
  } catch (err) {
    return handleDataError(err, res, next, 'Employee email');
  }
}

export async function updateEmployee(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  if (!validEmployee(req.body || {})) return validationError(res, 'Provide a valid name, email, and a role from the list');
  try {
    const values = employeeValues(req.body);
    const employee = await inTransaction(async (session) => {
      const before = await Employee.findOne({ _id: req.params.id, shopId: req.shopId }).session(session);
      if (!before) return null;
      const statusChanged = before.status !== values.status;
      const after = await Employee.findOneAndUpdate(
        { _id: before._id },
        // Deactivating also revokes every open session (the token version is checked on each request).
        { $set: values, ...(statusChanged && values.status === 'inactive' ? { $inc: { tokenVersion: 1 } } : {}) },
        { new: true, runValidators: true, session }
      );
      if (statusChanged) {
        await audit(session, { shopId: req.shopId, actor: req.actor, action: values.status === 'inactive' ? 'EMPLOYEE_DEACTIVATED' : 'EMPLOYEE_ACTIVATED', entityType: 'Employee', entityId: before._id, before: { status: before.status }, after: { status: values.status }, reason: String(req.body?.reason ?? '').slice(0, 500) });
      }
      return after;
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    return res.json({ employee: teamView(employee, req.actor) });
  } catch (err) {
    return handleDataError(err, res, next, 'Employee email');
  }
}

/** Owner sets a new temporary password; the employee is signed out and must change it at next login. */
export async function resetEmployeePassword(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  if (!isPassword(req.body?.password)) return validationError(res, PASSWORD_MESSAGE);
  try {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, shopId: req.shopId },
      { $set: { passwordHash, mustChangePassword: true }, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    return res.json({ employee: teamView(employee, req.actor) });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

export async function deleteEmployee(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  try {
    const employee = await Employee.findOneAndDelete({ _id: req.params.id, shopId: req.shopId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    return res.status(204).end();
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

// ---------------------------------------------------------------- managers (owner only)

/**
 * Promotes an employee to manager, keeping the same record (ID, password, history). Optional
 * overrides apply from the start. The token version is bumped so any open session of theirs is
 * renewed with the new role at its next request/refresh.
 */
export async function promoteManager(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  let overrides = { allow: [], deny: [] };
  if (req.body?.permissionOverrides !== undefined) {
    try { overrides = validateOverrides(req.body.permissionOverrides); } catch (err) { return validationError(res, err.message); }
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
  try {
    const result = await inTransaction(async (session) => {
      const before = await Employee.findOne({ _id: req.params.id, shopId: req.shopId }).session(session);
      if (!before) return { status: 404, message: 'Employee not found' };
      if (before.accessRole === 'manager') return { status: 409, message: 'This employee is already a manager' };
      const after = await Employee.findOneAndUpdate(
        { _id: before._id },
        { $set: { accessRole: 'manager', permissionOverrides: overrides, permissionsUpdatedAt: new Date(), permissionsUpdatedBy: req.actor } },
        { new: true, session }
      );
      await audit(session, {
        shopId: req.shopId, actor: req.actor, action: 'EMPLOYEE_PROMOTED', entityType: 'Employee', entityId: before._id, reason,
        before: { accessRole: before.accessRole ?? 'employee', effective: effectivePermissions(before) },
        after: { accessRole: 'manager', overrides, effective: effectivePermissions(after) }
      });
      return { employee: after };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.json({ employee: teamView(result.employee, req.actor), permissions: permissionView(result.employee) });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

/** Demotes a manager to employee: overrides are cleared (kept in the audit entry), nothing else about the record changes. */
export async function demoteManager(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
  try {
    const result = await inTransaction(async (session) => {
      const before = await Employee.findOne({ _id: req.params.id, shopId: req.shopId }).session(session);
      if (!before) return { status: 404, message: 'Employee not found' };
      if (before.accessRole !== 'manager') return { status: 409, message: 'This employee is not a manager' };
      const after = await Employee.findOneAndUpdate(
        { _id: before._id },
        { $set: { accessRole: 'employee', permissionOverrides: { allow: [], deny: [] }, permissionsUpdatedAt: new Date(), permissionsUpdatedBy: req.actor } },
        { new: true, session }
      );
      await audit(session, {
        shopId: req.shopId, actor: req.actor, action: 'MANAGER_DEMOTED', entityType: 'Employee', entityId: before._id, reason,
        before: { accessRole: 'manager', overrides: before.permissionOverrides, effective: effectivePermissions(before) },
        after: { accessRole: 'employee', effective: effectivePermissions(after) }
      });
      return { employee: after };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.json({ employee: teamView(result.employee, req.actor), permissions: permissionView(result.employee) });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

/** The employee's permission picture plus the history of role and permission changes (audit log). */
export async function getPermissions(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  try {
    const employee = await Employee.findOne({ _id: req.params.id, shopId: req.shopId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    const history = await AuditLog.find({ shopId: req.shopId, entityType: 'Employee', entityId: employee._id }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean();
    return res.json({ employee: teamView(employee, req.actor), permissions: permissionView(employee), history });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}

/** Replaces a manager's overrides. Only grantable permissions are accepted; the change applies on the manager's next request. */
export async function updatePermissions(req, res, next) {
  if (!isObjectId(req.params.id)) return validationError(res, 'Invalid employee ID');
  let overrides;
  try { overrides = validateOverrides(req.body?.permissionOverrides ?? req.body); } catch (err) { return validationError(res, err.message); }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
  try {
    const result = await inTransaction(async (session) => {
      const before = await Employee.findOne({ _id: req.params.id, shopId: req.shopId }).session(session);
      if (!before) return { status: 404, message: 'Employee not found' };
      if (before.accessRole !== 'manager') return { status: 409, message: 'Permissions can only be changed for managers' };
      const after = await Employee.findOneAndUpdate(
        { _id: before._id },
        { $set: { permissionOverrides: overrides, permissionsUpdatedAt: new Date(), permissionsUpdatedBy: req.actor } },
        { new: true, session }
      );
      await audit(session, {
        shopId: req.shopId, actor: req.actor, action: 'MANAGER_PERMISSIONS_CHANGED', entityType: 'Employee', entityId: before._id, reason,
        before: { overrides: before.permissionOverrides, effective: effectivePermissions(before) },
        after: { overrides, effective: effectivePermissions(after) }
      });
      return { employee: after };
    });
    if (result.status) return res.status(result.status).json({ message: result.message });
    return res.json({ employee: teamView(result.employee, req.actor), permissions: permissionView(result.employee) });
  } catch (err) {
    return handleDataError(err, res, next);
  }
}
