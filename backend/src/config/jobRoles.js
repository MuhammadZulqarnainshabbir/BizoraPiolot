// Job titles the owner can give an employee (the "Role" dropdown on the web and mobile forms).
// This is the single source of truth: the apps load it from GET /api/v1/employees/roles and the
// server refuses any other value. It is separate from the access level (accessRole: employee |
// manager), which decides what the account may do.
export const JOB_ROLES = Object.freeze([
  'Sales',
  'Senior sales',
  'Cashier',
  'Store manager',
  'Floor supervisor',
  'Stock keeper',
  'Technician',
  'Delivery',
  'Accountant',
  'Receptionist',
  'Other'
]);

export const isJobRole = (value) => typeof value === 'string' && JOB_ROLES.includes(value.trim());
