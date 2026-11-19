import { Router } from 'express';
import * as c from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadShop } from '../middleware/shop.js';

// /api/v1/dashboard
const router = Router();
router.use(authenticate, loadShop);

// Shop-wide (operational) dashboard: owner and managers. Cost figures inside are still gated by inventory.viewCost.
router.get('/partner/summary', authorize('dashboard.operational'), c.partnerSummary);
router.get('/partner/inventory', authorize('dashboard.operational'), c.partnerInventory);
router.get('/partner/full-price-sales', authorize('dashboard.operational'), c.partnerFullPrice);
router.get('/partner/installment-sales', authorize('dashboard.operational'), c.partnerInstallment);
router.get('/partner/employees', authorize('dashboard.operational', 'employees.view'), c.partnerEmployees);

router.get('/employee/summary', authorize('dashboard.employee'), c.employeeSummary);
router.get('/employee/my-sales', authorize('dashboard.employee'), c.employeeMySales);

export default router;
