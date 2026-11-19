import { Router } from 'express';
import * as c from '../controllers/salesController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loadShop } from '../middleware/shop.js';
import { requireFeature } from '../middleware/entitlements.js';

// /api/v1/sales — owners see every sale in the shop, employees only their own (enforced in the service).
export const salesRouter = Router();
salesRouter.use(authenticate, loadShop);
salesRouter.post('/full-price', authorize('sales.create'), c.sellFullPrice);
salesRouter.post('/installment', authorize('sales.create'), requireFeature('installments'), c.sellInstallment);
salesRouter.get('/full-price/export', authorize('reports.export'), requireFeature('csv_export'), c.exportFullPrice);
salesRouter.get('/installment/export', authorize('reports.export'), requireFeature('csv_export'), c.exportInstallment);
salesRouter.get('/full-price', c.listFullPrice);
salesRouter.get('/installment', c.listInstallment);
salesRouter.get('/my-sales', c.listMySales);
salesRouter.get('/', c.listSales);
// Receipts: anyone who may see the sale (owner; the employee who made it) may download its receipt.
salesRouter.get('/:id/receipt.pdf', requireFeature('receipts_pdf'), c.saleReceipt);
salesRouter.get('/:id', c.getSale);
salesRouter.post('/:id/cancel', authorize('sales.correct'), c.cancelSale);
salesRouter.post('/:id/refund', authorize('sales.correct'), c.refundSale);

// /api/v1/installments — employees can read their own agreements; only the owner records payments.
export const installmentsRouter = Router();
installmentsRouter.use(authenticate, loadShop);
installmentsRouter.get('/:id', c.getAgreement);
installmentsRouter.get('/:id/payments', c.listPayments);
installmentsRouter.get('/:id/payments/:paymentId/receipt.pdf', requireFeature('receipts_pdf'), c.paymentReceipt);
installmentsRouter.post('/:id/payments', authorize('installments.recordPayment'), c.recordPayment);
