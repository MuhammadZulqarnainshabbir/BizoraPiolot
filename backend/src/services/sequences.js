import Employee from '../models/Employee.js';
import Shop from '../models/Shop.js';

/** Atomically takes the next number from a per-shop counter. Pass `session` inside a transaction. */
async function nextSeq(shopId, field, session) {
  const shop = await Shop.findByIdAndUpdate(shopId, { $inc: { [field]: 1 } }, { new: true, projection: { [field]: 1 }, session });
  if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
  return shop[field];
}

const pad = (n, width) => String(n).padStart(width, '0');

export const nextEmployeeId = async (shopId, session) => `EMP-${pad(await nextSeq(shopId, 'employeeSeq', session), 4)}`;
export const nextSaleNumber = async (shopId, session) => `S-${pad(await nextSeq(shopId, 'saleSeq', session), 6)}`;
export const nextProductCode = async (shopId, session) => `P-${pad(await nextSeq(shopId, 'productSeq', session), 4)}`;
export const nextAgreementNumber = async (shopId, session) => `IA-${pad(await nextSeq(shopId, 'agreementSeq', session), 6)}`;
export const nextCustomerCode = async (shopId, session) => `C-${pad(await nextSeq(shopId, 'customerSeq', session), 4)}`;

/**
 * Employees created before access roles existed stay plain employees: sets accessRole 'employee'
 * where the field is missing. Repeatable, touches nothing else, and reversible by unsetting the field.
 */
export async function backfillAccessRoles() {
  const result = await Employee.updateMany({ accessRole: { $exists: false } }, { $set: { accessRole: 'employee' } });
  if (result.modifiedCount) console.log(`Marked ${result.modifiedCount} existing employee(s) as accessRole 'employee'`);
}

/** Gives employees created before employee IDs existed an ID, oldest first. Safe to run on every start. */
export async function backfillEmployeeIds() {
  const missing = await Employee.find({ employeeId: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).select('_id shopId').lean();
  for (const employee of missing) {
    const employeeId = await nextEmployeeId(employee.shopId);
    await Employee.updateOne({ _id: employee._id, employeeId: { $exists: false } }, { $set: { employeeId } });
  }
  if (missing.length) console.log(`Assigned employee IDs to ${missing.length} existing employee(s)`);
}
