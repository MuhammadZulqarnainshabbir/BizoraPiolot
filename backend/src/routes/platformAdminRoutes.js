import { Router } from 'express';
import * as a from '../controllers/platformAdminController.js';
import * as auth from '../controllers/platformAuthController.js';
import { authenticatePlatformAdmin, platformApiLimiter, platformLoginLimiter, requirePlatformPermission as perm } from '../middleware/platformAuth.js';

// /api/v1/platform-admin — Bizora's own console. Separate identities, token audience and
// permissions from the shops; every route below names the platform permission it needs.
const router = Router();
router.use(platformApiLimiter);

// Sign-in and the signed-in admin's own account.
router.post('/auth/login', platformLoginLimiter, auth.login);
router.get('/me', authenticatePlatformAdmin({ allowSetupScope: true }), auth.me);
router.post('/auth/refresh', authenticatePlatformAdmin({ allowSetupScope: true }), auth.refresh);
router.post('/auth/logout', authenticatePlatformAdmin({ allowSetupScope: true }), auth.logout);
router.post('/auth/change-password', authenticatePlatformAdmin({ allowSetupScope: true }), auth.changePassword);
router.post('/auth/mfa/setup', authenticatePlatformAdmin({ allowSetupScope: true }), auth.mfaSetup);
router.post('/auth/mfa/enable', authenticatePlatformAdmin({ allowSetupScope: true }), auth.mfaEnable);

// Everything else needs a full session.
router.use(authenticatePlatformAdmin());

router.get('/dashboard', perm('dashboard.view'), a.dashboard);
router.get('/analytics', perm('analytics.view'), a.analyticsReport);
router.get('/health', perm('health.view'), a.health);

router.get('/shops', perm('shops.view'), a.listShops);
router.get('/shops/:id', perm('shops.view'), a.getShop);
router.get('/shops/:id/diagnostics', perm('shops.diagnostics'), a.shopDiagnostics);
router.post('/shops/:id/approve', perm('shops.manage'), a.approveShop);
router.post('/shops/:id/suspend', perm('shops.manage'), a.suspendShop);
router.post('/shops/:id/reactivate', perm('shops.manage'), a.reactivateShop);
router.post('/shops/:id/deactivate', perm('shops.manage'), a.deactivateShop);
router.get('/shops/:id/features', perm('features.view'), a.shopFeatures);
router.put('/shops/:id/features/:key', perm('features.manage'), a.setShopFeature);
router.delete('/shops/:id/features/:key', perm('features.manage'), a.clearShopFeature);
router.put('/shops/:id/subscription', perm('subscriptions.manage'), a.setSubscription);

router.get('/administrators', perm('admins.view'), a.listAdmins);
router.post('/administrators', perm('admins.manage'), a.createAdmin);
router.patch('/administrators/:id', perm('admins.manage'), a.updateAdmin);
router.post('/administrators/:id/revoke-sessions', perm('admins.manage'), a.revokeAdminSessions);
router.post('/administrators/:id/reset-password', perm('admins.manage'), a.resetAdminPassword);

router.get('/plans', perm('plans.view'), a.listPlans);
router.post('/plans', perm('plans.manage'), a.createPlan);
router.patch('/plans/:key', perm('plans.manage'), a.updatePlan);
router.get('/subscriptions', perm('subscriptions.view'), a.listSubscriptions);
router.get('/features', perm('features.view'), a.featureCatalog);

router.get('/audit-logs', perm('audit.view'), a.auditLogs);
router.get('/settings', perm('settings.view'), a.getSettings);
router.patch('/settings', perm('settings.manage'), a.updateSettings);

export default router;
