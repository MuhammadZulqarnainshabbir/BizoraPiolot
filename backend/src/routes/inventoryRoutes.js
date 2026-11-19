import { Router } from 'express';
import * as c from '../controllers/inventoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadShop } from '../middleware/shop.js';
import { loadEntitlements } from '../middleware/entitlements.js';

// /api/v1/products — shop owner and employees (permissions per route). Shop comes from the token.
const router = Router();
router.use(authenticate, loadShop);

router.get('/categories', c.listCategories);
router.get('/stock-summary', authorize('inventory.view'), c.stockSummary);
router.get('/units', authorize('inventory.view'), c.listUnits);
router.get('/units/by-serial/:serial', authorize('inventory.view'), c.findBySerial);
router.get('/units/:unitId', authorize('inventory.view'), c.getUnit);
router.patch('/units/:unitId', authorize('inventory.edit'), c.updateUnit);
router.delete('/units/:unitId', authorize('inventory.delete'), c.deleteUnit);
router.post('/', authorize('inventory.add'), loadEntitlements, c.addStock);
router.get('/', authorize('inventory.view'), c.listProducts);
router.get('/:id', authorize('inventory.view'), c.getProduct);
router.patch('/:id', authorize('products.edit'), c.updateProduct);

export default router;
