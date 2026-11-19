import { Router } from 'express';
import * as c from '../controllers/customerController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadShop } from '../middleware/shop.js';
import { requireFeature } from '../middleware/entitlements.js';

// /api/v1/customers — shop owner and employees (permissions per route). Shop comes from the token.
const router = Router();
router.use(authenticate, loadShop);

router.get('/', authorize('customers.view'), c.list);
router.post('/', authorize('customers.manage'), c.create);
router.get('/:id', authorize('customers.view'), c.get);
router.patch('/:id', authorize('customers.manage'), c.update);
router.delete('/:id', authorize('customers.delete'), c.remove);
// ID pictures. Uploads are JSON with a data URL (see app.js for the larger body limit on this router).
router.post('/:id/documents', authorize('customers.manage'), requireFeature('customer_documents'), c.addDocument);
router.get('/:id/documents/:docId', authorize('customers.view'), c.getDocument);
router.delete('/:id/documents/:docId', authorize('customers.manage'), c.deleteDocument);

export default router;
