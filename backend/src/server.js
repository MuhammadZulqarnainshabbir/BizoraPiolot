import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { backfillAccessRoles, backfillEmployeeIds } from './services/sequences.js';
import { backfillShopCodes } from './services/shopCodes.js';
import { backfillShopStatus } from './services/platform/shopStatus.js';
import { seedPlatformDefaults } from './services/platform/subscriptionService.js';

const required = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];
for (const name of required) if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');

try {
  await connectDB();
  await backfillEmployeeIds();
  await backfillAccessRoles();
  await backfillShopCodes();
  await backfillShopStatus();
  await seedPlatformDefaults();
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => console.log(`API listening on port ${port}`));
} catch (err) { console.error('Startup failed:', err.message ?? err); process.exit(1); }
