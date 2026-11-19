import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import employeeManagementRoutes from './routes/employeeManagementRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import { installmentsRouter, salesRouter } from './routes/salesRoutes.js';
import { listCategories } from './controllers/inventoryController.js';
import platformAdminRoutes from './routes/platformAdminRoutes.js';
import { authenticate } from './middleware/auth.js';
import { requestMetrics } from './middleware/requestMetrics.js';

/** The Express application, without starting a server (used by server.js and the tests). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx or a load balancer (TRUST_PROXY=1: one hop): rate limits then apply per client IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(helmet());
  app.use(requestMetrics);
  app.use(cors({ origin: process.env.CLIENT_ORIGIN, exposedHeaders: ['Content-Disposition'] }));
  // Customer ID pictures are uploaded as base64 JSON, so that router gets a larger body limit.
  // (A body parsed here is skipped by the general parser below.)
  app.use('/api/v1/customers', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/employee', employeeRoutes);           // employee sign-in and account
  app.use('/api/v1/employees', employeeManagementRoutes); // owner manages employees
  app.get('/api/v1/categories', authenticate, listCategories);
  app.use('/api/v1/products', inventoryRoutes);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/sales', salesRouter);
  app.use('/api/v1/installments', installmentsRouter);
  app.use('/api/v1/dashboard', dashboardRoutes);
  // Bizora's own console: separate identities, tokens and permissions (see routes/platformAdminRoutes.js).
  app.use('/api/v1/platform-admin', platformAdminRoutes);

  app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
  // Error responses: { message, code?, details? }. Server errors never leak internals.
  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500 && status !== 503) console.error(err);
    if (status === 400 && err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
    const body = { message: status < 500 || status === 503 ? err.message : 'Unexpected server error' };
    if (err.code && typeof err.code === 'string' && status < 500) body.code = err.code;
    if (err.details && status < 500) body.details = err.details;
    res.status(status).json(body);
  });
  return app;
}
