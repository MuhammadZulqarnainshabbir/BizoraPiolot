import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, login, me, refresh, shopInfo, shopInfoByCode } from '../controllers/employeeAuthController.js';
import { requireEmployee } from '../middleware/auth.js';

// /api/v1/employee — employee sign-in and account. Inventory and sales are shared endpoints
// (/api/v1/products, /sales, /installments, /dashboard) with per-role permissions.
const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many login attempts, please try again later' }
});
// Shop-code lookups are public; limit them so codes can't be enumerated quickly.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many requests, please try again later' }
});
const signedInPendingPassword = requireEmployee({ allowPendingPasswordChange: true });

router.get('/shops/by-code/:code', lookupLimiter, shopInfoByCode);
router.get('/shops/:shopId', shopInfo);
router.post('/login', loginLimiter, login);
router.get('/me', signedInPendingPassword, me);
router.post('/refresh', signedInPendingPassword, refresh);
router.post('/change-password', loginLimiter, signedInPendingPassword, changePassword);

export default router;
