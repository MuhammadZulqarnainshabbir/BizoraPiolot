import { Router } from 'express';
import { createEmployee, deleteEmployee, demoteManager, getPermissions, listEmployees, listManagers, listRoles, permissionRegistry, promoteManager, resetEmployeePassword, updateEmployee, updatePermissions } from '../controllers/employeeController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadShop } from '../middleware/shop.js';
import { loadEntitlements, requireFeature } from '../middleware/entitlements.js';

// /api/v1/employees — the team. Managers may see the list (employees.view); only the owner
// creates, edits or removes accounts (employees.manage) and promotes, demotes or changes manager
// permissions (employees.managePermissions). Neither of those is grantable, so a manager can
// never administer the team or their own role.
const router = Router();
router.use(authenticate, loadShop);

router.get('/permissions/registry', authorize('employees.view'), permissionRegistry);
router.get('/roles', authorize('employees.view'), listRoles);
router.get('/managers', authorize('employees.view'), listManagers);
router.get('/', authorize('employees.view'), listEmployees);
router.post('/', authorize('employees.manage'), loadEntitlements, createEmployee);
router.put('/:id', authorize('employees.manage'), updateEmployee);
router.post('/:id/password', authorize('employees.manage'), resetEmployeePassword);
router.delete('/:id', authorize('employees.manage'), deleteEmployee);
router.post('/:id/promote-manager', authorize('employees.managePermissions'), requireFeature('manager_role'), promoteManager);
router.post('/:id/demote-manager', authorize('employees.managePermissions'), demoteManager);
router.get('/:id/permissions', authorize('employees.managePermissions'), getPermissions);
router.patch('/:id/permissions', authorize('employees.managePermissions'), updatePermissions);

export default router;
