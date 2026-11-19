import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';

/**
 * The manager role through the real UI: the owner promotes an employee and adjusts their
 * permissions on the Shop profile page; the manager signs in through the staff login, lands on
 * the manager portal, sees the shop dashboard and team but no purchase costs; the owner demotes
 * them and their open session falls back to the employee portal.
 */
const API = 'http://localhost:3999/api/v1';

async function seed(request: APIRequestContext) {
  const email = `owner-m${Date.now()}@example.com`;
  const password = 'OwnerPass123';
  await request.post(`${API}/auth/register-shop`, { data: { shopName: 'Managershop', ownerName: 'Mona Owner', email, phone: '0300 1234567', address: 'Lahore', password, confirmPassword: password } });
  const { token } = await (await request.post(`${API}/auth/login`, { data: { email, password } })).json();
  const auth = { Authorization: `Bearer ${token}` };
  const { categories } = await (await request.get(`${API}/categories`, { headers: auth })).json();
  const { employee } = await (await request.post(`${API}/employees`, { headers: auth, data: { name: 'Mia Manager', email: `mia${Date.now()}@example.com`, role: 'Floor supervisor', password: 'TempPass99' } })).json();
  const stock = await request.post(`${API}/products`, {
    headers: auth,
    data: {
      product: { name: 'Galaxy S25 128GB', brand: 'Samsung', model: 'S25', category: categories[0].name, subCategory: categories[0].subCategories[0] },
      serialNumbers: ['SN-M1', 'SN-M2'], purchasePrice: 100000, sellingPrice: 120000
    }
  });
  expect(stock.status()).toBe(201);
  const { units } = await stock.json();
  const { shop } = await (await request.get(`${API}/auth/me`, { headers: auth })).json();
  return { email, password, employee, shop, units };
}

async function staffLogin(browser: Browser, shop: { slug: string; id: string }, employeeId: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/${shop.slug}/${shop.id}/employee/login`);
  await page.fill('#employeeId', employeeId);
  await page.fill('#employeePassword', password);
  await page.click('button[type=submit]');
  return page;
}

test('owner promotes, configures and demotes a manager; the manager portal shows the shop without costs', async ({ page: owner, browser, request }) => {
  const { email, password, employee, shop, units } = await seed(request);
  const errors: string[] = [];
  owner.on('pageerror', e => errors.push(e.message));

  await test.step('owner signs in and promotes the employee from the team list', async () => {
    await owner.goto('/login');
    await owner.fill('#email', email);
    await owner.fill('#password', password);
    await owner.click('button[type=submit]');
    await owner.waitForURL('**/partnerdashboard');
    await owner.goto('/partnerdashboard/profile');
    const row = owner.locator('.employee-manager tbody tr', { hasText: 'Mia Manager' });
    await expect(row.locator('.sale-badge')).toHaveText('Employee');
    await row.getByRole('button', { name: 'Promote to manager' }).click();
    await owner.getByRole('button', { name: 'Promote', exact: true }).click();
    await expect(owner.locator('.record-success')).toContainText('Mia Manager is now a manager');
    await expect(row.locator('.sale-badge')).toHaveText('Manager');
  });

  await test.step('owner grants installment collection in the permission editor', async () => {
    await expect(owner.getByText('Manager permissions · Mia Manager')).toBeVisible();
    const collect = owner.locator('.permission-row', { hasText: 'Record installment payments' }).locator('input[type=checkbox]');
    await expect(collect).not.toBeChecked();
    await collect.check();
    const costs = owner.locator('.permission-row', { hasText: 'See purchase costs' }).locator('input[type=checkbox]');
    await expect(costs).not.toBeChecked();
    const ownerOnly = owner.locator('.permission-row', { hasText: 'Promote or demote managers' }).locator('input[type=checkbox]');
    await expect(ownerOnly).toBeDisabled();
    await owner.getByRole('button', { name: 'Save permissions' }).click();
    await expect(owner.locator('.record-success')).toContainText('Permissions saved for Mia Manager');
    await expect(owner.locator('.employee-manager tbody tr', { hasText: 'Mia Manager' })).toContainText('custom permissions');
  });

  const manager = await staffLogin(browser, shop, employee.employeeId, 'TempPass99');
  manager.on('pageerror', e => errors.push(e.message));

  await test.step('manager signs in with the temporary password and lands on the manager portal', async () => {
    await manager.waitForURL('**/manager/password');
    await manager.fill('input[formcontrolname=currentPassword]', 'TempPass99');
    await manager.fill('input[formcontrolname=password]', 'ManagerPass123');
    await manager.fill('input[formcontrolname=confirmPassword]', 'ManagerPass123');
    await manager.click('button[type=submit]');
    await manager.waitForURL(`**/${shop.slug}/${shop.id}/manager`);
    await expect(manager.getByText('Good to see you, Mia Manager')).toBeVisible();
    await expect(manager.locator('.workspace-label').first()).toHaveText('MANAGER');
    await expect(manager.locator('.workspace-nav a', { hasText: 'Team' })).toBeVisible();
    await expect(manager.locator('.metric-grid .metric-card').first()).toBeVisible();
    expect(await manager.locator('.metric-grid .metric-card').count()).toBeGreaterThanOrEqual(9);
  });

  await test.step('manager sees the team and a unit without its purchase price', async () => {
    await manager.locator('.workspace-nav a', { hasText: 'Team' }).click();
    await expect(manager.locator('.record-table tbody tr', { hasText: 'Mia Manager' })).toContainText('Manager');
    await manager.goto(`/${shop.slug}/${shop.id}/manager/inventory/units/${units[0]._id}`);
    await expect(manager.getByText('SELLING PRICE')).toBeVisible();
    await expect(manager.getByText('PURCHASE PRICE')).toHaveCount(0);
    await expect(manager.getByRole('link', { name: 'Sold at full price' })).toBeVisible();
    await expect(manager.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });

  await test.step('the employee portal URL sends a manager to the manager portal', async () => {
    await manager.goto(`/${shop.slug}/${shop.id}/employee/inventory`);
    await manager.waitForURL(`**/${shop.slug}/${shop.id}/manager`);
  });

  await test.step('owner demotes the manager; their open session falls back to the employee portal', async () => {
    const row = owner.locator('.employee-manager tbody tr', { hasText: 'Mia Manager' });
    await row.getByRole('button', { name: 'Demote to employee' }).click();
    await owner.getByRole('button', { name: 'Demote', exact: true }).click();
    await expect(owner.locator('.record-success')).toContainText('Mia Manager is an employee again');
    await expect(row.locator('.sale-badge')).toHaveText('Employee');
    await manager.reload();
    await manager.waitForURL(`**/${shop.slug}/${shop.id}/employee`);
    await expect(manager.getByText('Hello, Mia Manager')).toBeVisible();
    await expect(manager.locator('.workspace-label').first()).toHaveText('EMPLOYEE');
  });

  expect(errors).toEqual([]);
});
