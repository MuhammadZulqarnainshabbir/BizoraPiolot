import { APIRequestContext, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The platform console through the real UI: a super admin is provisioned with the CLI (no
 * default password anywhere), signs in, is forced to replace the temporary password, finds a
 * shop, suspends it with a reason, and the shop owner is locked out until it is reactivated.
 */
const API = 'http://localhost:3999/api/v1';
const MONGO_URI = process.env['E2E_MONGO_URI'] ?? 'mongodb://127.0.0.1:27017/bizora_pilot_e2e?directConnection=true';
const TEMP_PASSWORD = 'Temporary-Pass-2026';
const NEW_PASSWORD = 'My-Own-Password-2026';

async function seedShop(request: APIRequestContext) {
  const email = `owner-p${Date.now()}@example.com`;
  const password = 'OwnerPass123';
  await request.post(`${API}/auth/register-shop`, { data: { shopName: 'Platform Target', ownerName: 'Pat Owner', email, phone: '0300 1234567', address: 'Lahore', password, confirmPassword: password } });
  const login = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const { shop } = await login.json();
  return { email, password, shop };
}

test('super admin signs in, finishes set-up, suspends and reactivates a shop', async ({ page, request, browser }) => {
  const adminEmail = `super-${Date.now()}@bizora.test`;
  // Provision exactly as an operator would, with the password supplied through the environment.
  execFileSync(process.execPath, ['scripts/create-platform-admin.js', '--email', adminEmail, '--name', 'Sue Super', '--role', 'SUPER_ADMIN'], {
    cwd: join(__dirname, '..', '..', 'backend'),
    env: { ...process.env, MONGO_URI, JWT_SECRET: 'e2e-only-secret-that-is-long-enough-for-hs256-signing', CLIENT_ORIGIN: 'http://localhost:4300', PLATFORM_ADMIN_PASSWORD: TEMP_PASSWORD },
    stdio: 'pipe'
  });
  const { email: ownerEmail, password: ownerPassword, shop } = await seedShop(request);

  // The public navigation bar is not part of the console.
  await page.goto('/platform-admin/login');
  await expect(page.locator('header.nav')).toHaveCount(0);
  await page.fill('#pa-email', adminEmail);
  await page.fill('#pa-password', TEMP_PASSWORD);
  await page.click('button[type=submit]');

  // Forced password change before anything else.
  await expect(page).toHaveURL(/\/platform-admin\/setup$/);
  await page.fill('#pa-current', TEMP_PASSWORD);
  await page.fill('#pa-new', NEW_PASSWORD);
  await page.fill('#pa-confirm', NEW_PASSWORD);
  await page.click('button:has-text("Change password")');
  await expect(page).toHaveURL(/\/platform-admin$/);
  await expect(page.locator('h1')).toHaveText('Dashboard');
  await expect(page.locator('.pa-stat').first()).toContainText('Shops');

  // Find the shop and suspend it with a reason.
  await page.click('nav.pa-nav a:has-text("Shops")');
  await expect(page).toHaveURL(/\/platform-admin\/shops$/);
  await page.fill('input[name=search]', 'Platform Target');
  await page.click('button:has-text("Apply")');
  await page.click('a:has-text("Platform Target")');
  await expect(page.locator('h1')).toContainText('Platform Target');
  await expect(page.locator('.pa-badge-lg')).toHaveText('ACTIVE');
  await page.click('button:has-text("Suspend")');
  await page.fill('.confirm-dialog textarea', 'Unpaid invoice INV-42');
  await page.click('.confirm-dialog button:has-text("Suspend")');
  await expect(page.locator('.pa-badge-lg')).toHaveText('SUSPENDED');
  await expect(page.locator('.pa-notice-inline')).toContainText('Unpaid invoice INV-42');

  // The owner is locked out with the policy message, through the real login page.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto('/login');
  await ownerPage.fill('#email', ownerEmail);
  await ownerPage.fill('#password', ownerPassword);
  await ownerPage.click('button[type=submit]');
  await expect(ownerPage.locator('.error')).toContainText('suspended');
  await expect(ownerPage).toHaveURL(/\/login$/);

  // Reactivate; the owner gets back in.
  await page.click('button:has-text("Reactivate")');
  await page.fill('.confirm-dialog textarea', 'Invoice paid');
  await page.click('.confirm-dialog button:has-text("Reactivate")');
  await expect(page.locator('.pa-badge-lg')).toHaveText('ACTIVE');
  await ownerPage.click('button[type=submit]');
  await expect(ownerPage).toHaveURL(/\/partnerdashboard/);
  await ownerContext.close();

  // Both actions are in the audit log with the reasons.
  await page.click('nav.pa-nav a:has-text("Audit log")');
  await expect(page.locator('.pa-table')).toContainText('SHOP_SUSPENDED');
  await expect(page.locator('.pa-table')).toContainText('Unpaid invoice INV-42');
  await expect(page.locator('.pa-table')).toContainText('SHOP_REACTIVATED');

  // A shop owner's token opens nothing on the platform API (checked at the API, not just the UI).
  const ownerLogin = await request.post(`${API}/auth/login`, { data: { email: ownerEmail, password: ownerPassword } });
  const { token } = await ownerLogin.json();
  const forbidden = await request.get(`${API}/platform-admin/shops/${shop.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(forbidden.status()).toBe(401);

  // Sign out ends the console session.
  await page.click('button.pa-logout');
  await expect(page).toHaveURL(/\/platform-admin\/login$/);
  await page.goto('/platform-admin');
  await expect(page).toHaveURL(/\/platform-admin\/login$/);
});
