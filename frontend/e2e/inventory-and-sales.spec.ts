import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';

/**
 * The whole serialized-inventory flow through the real UI, in both portals:
 * owner adds stock and sells, employee sells at full price and on installment,
 * owner records a payment, refunds a sale, exports CSV; Urdu and phone width.
 */
const API = 'http://localhost:3999/api/v1';
const text = async (page: Page, selector: string) => ((await page.locator(selector).textContent()) ?? '').replace(/\s+/g, ' ').trim();

async function seed(request: APIRequestContext) {
  const email = `owner${Date.now()}@example.com`;
  const password = 'OwnerPass123';
  await request.post(`${API}/auth/register-shop`, { data: { shopName: 'Tenshop', ownerName: 'Tina Owner', email, phone: '0300 1234567', address: 'Lahore', password, confirmPassword: password } });
  const { token } = await (await request.post(`${API}/auth/login`, { data: { email, password } })).json();
  const auth = { Authorization: `Bearer ${token}` };
  const { categories } = await (await request.get(`${API}/categories`, { headers: auth })).json();
  const { employee } = await (await request.post(`${API}/employees`, { headers: auth, data: { name: 'Eve Seller', email: `eve${Date.now()}@example.com`, role: 'Sales', password: 'TempPass99' } })).json();
  const stock = await request.post(`${API}/products`, {
    headers: auth,
    data: {
      product: { name: 'Galaxy S25 128GB', brand: 'Samsung', model: 'S25', category: categories[0].name, subCategory: categories[0].subCategories[0] },
      serialNumbers: ['SN-A1', 'SN-A2', 'SN-A3'], purchasePrice: 100000, sellingPrice: 120000
    }
  });
  expect(stock.status()).toBe(201);
  const { shop } = await (await request.get(`${API}/auth/me`, { headers: auth })).json();
  return { email, password, employee, shop };
}

async function employeeLogin(browser: Browser, shop: { slug: string; id: string }, employeeId: string, password: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext({ acceptDownloads: true, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  await page.goto(`/${shop.slug}/${shop.id}/employee/login`);
  await page.fill('#employeeId', employeeId);
  await page.fill('#employeePassword', password);
  await page.click('button[type=submit]');
  return page;
}

test('owner and employee: stock, sales, installments, corrections, Urdu, phone', async ({ page: owner, browser, request }) => {
  const { email, password, employee, shop } = await seed(request);
  const errors: string[] = [];
  owner.on('pageerror', e => errors.push(e.message));

  await test.step('owner signs in and sees the overview', async () => {
    await owner.goto('/login');
    await owner.fill('#email', email);
    await owner.fill('#password', password);
    await owner.click('button[type=submit]');
    await owner.waitForURL('**/partnerdashboard');
    await expect(owner.getByText('Good to see you, Tina Owner')).toBeVisible();
    await expect(owner.locator('.metric-grid .metric-card')).toHaveCount(8);
    await expect(owner.locator('.metric-expandable strong')).toHaveText('3');
    await owner.click('.metric-toggle');
    await expect(owner.locator('.overview-units tbody tr')).toHaveCount(3);
  });

  await test.step('owner adds stock; duplicate serials are refused', async () => {
    await owner.goto('/partnerdashboard/inventory/add');
    await owner.locator('label:has-text("Existing product") input').check();
    await owner.locator('select[formcontrolname=productId]').selectOption({ index: 1 });
    await owner.fill('textarea[formcontrolname=serials]', 'SN-B1\nsn-a1');
    await owner.locator('label:has-text("Purchase price") input').fill('100000');
    await owner.locator('label:has-text("Selling price") input').fill('125000');
    await owner.click('button[type=submit]');
    await expect(owner.locator('.record-alert')).toContainText('already in your stock');
    await owner.fill('textarea[formcontrolname=serials]', 'SN-B1\nSN-B2\nsn-b1');
    await expect(owner.locator('.serial-count')).toContainText('Entered more than once');
    await owner.fill('textarea[formcontrolname=serials]', 'SN-B1\nSN-B2');
    await owner.click('button[type=submit]');
    await expect(owner.locator('.added-result h2')).toContainText('2 units of Galaxy S25 128GB added');
    await owner.goto('/partnerdashboard/inventory');
    await expect(owner.locator('.data-page-toolbar p')).toContainText('5 units');
  });

  await test.step('owner sells SN-A1 at full price with a discount', async () => {
    await owner.locator('tr', { hasText: 'SN-A1' }).getByRole('button', { name: 'Mark as sold' }).click();
    await owner.locator('.sell-menu a', { hasText: 'Sold at full price' }).click();
    await owner.waitForURL('**/sell/full-price/**');
    await owner.locator('input[formcontrolname=salePrice]').fill('115000');
    await expect(owner.locator('.sale-facts')).toContainText('5,000');
    await owner.click('button:has-text("Record full-price sale")');
    await expect(owner.locator('.added-result h2')).toContainText('S-000001 recorded');
  });

  const emp = await employeeLogin(browser, shop, employee.employeeId, 'TempPass99');
  emp.on('pageerror', e => errors.push(e.message));

  await test.step('employee changes the temporary password and sees their summary', async () => {
    await emp.waitForURL('**/employee/password');
    await emp.getByLabel('Current password').fill('TempPass99');
    await emp.getByLabel('New password', { exact: true }).fill('EvePass123');
    await emp.getByLabel('Confirm new password').fill('EvePass123');
    await emp.click('button:has-text("Change password")');
    await emp.waitForURL(u => u.pathname.endsWith('/employee'));
    await expect(emp.getByText('Hello, Eve Seller')).toBeVisible();
    await expect(emp.locator('.metric-card').first()).toBeVisible();
  });

  await test.step('employee sees no cost and no owner-only actions', async () => {
    await emp.click('.workspace-nav a:has-text("Inventory")');
    await expect(emp.locator('tr', { hasText: 'SN-A1' })).toContainText('Sold at full price');
    await emp.locator('tr', { hasText: 'SN-A2' }).locator('a', { hasText: 'View' }).click();
    await expect(emp.locator('.detail-card')).toBeVisible();
    await expect(emp.locator('.detail-grid')).not.toContainText('PURCHASE PRICE');
    await expect(emp.locator('.detail-actions button')).toHaveCount(0);
  });

  await test.step('employee sells SN-A2 at full price', async () => {
    await emp.click('.detail-actions a:has-text("Sold at full price")');
    await expect(emp.locator('input[formcontrolname=salePrice]')).toBeVisible();
    await emp.click('button:has-text("Record full-price sale")');
    await expect(emp.locator('.added-result h2')).toContainText('S-000002 recorded');
  });

  await test.step('employee sells SN-A3 on installment (uneven last installment)', async () => {
    await emp.goto(emp.url().replace(/\/sell\/.*$/, '/inventory'));
    await emp.locator('tr', { hasText: 'SN-A3' }).getByRole('button', { name: 'Mark as sold' }).click();
    await emp.locator('.sell-menu a', { hasText: 'Sold on installment' }).click();
    await emp.locator('input[formcontrolname=customerName]').fill('Carla Customer');
    await emp.locator('input[formcontrolname=customerPhone]').fill('0301 7654321');
    await emp.locator('input[formcontrolname=totalPrice]').fill('130000');
    await emp.locator('input[formcontrolname=downPayment]').fill('30000');
    await emp.locator('input[formcontrolname=installmentCount]').fill('3');
    await expect(emp.locator('.schedule-preview tbody tr')).toHaveCount(3);
    await expect(emp.locator('.sale-preview')).toContainText('33,333.33 × 3');
    await expect(emp.locator('.sale-preview')).toContainText('33,333.34');
    await emp.click('button:has-text("Record installment sale")');
    await expect(emp.locator('.added-result h2')).toContainText('IA-000001 created');
    await emp.click('.added-result a:has-text("View agreement")');
    await expect(emp.locator('.detail-card')).toBeVisible();
    await expect(emp.locator('button:has-text("Record payment")')).toHaveCount(0);
    await expect(emp.getByText('Payments are recorded by the shop owner.')).toBeVisible();
  });

  await test.step('employee only sees their own sales; no export', async () => {
    await emp.click('.workspace-nav a:has-text("My full-price sales")');
    await expect(emp.locator('tbody tr')).toHaveCount(1);
    await expect(emp.locator('tbody tr').first()).toContainText('S-000002');
    await expect(emp.locator('button:has-text("Export CSV")')).toHaveCount(0);
    await emp.click('.workspace-nav a:has-text("My installment sales")');
    await emp.waitForURL('**/sales/installments');
    await expect(emp.locator('tbody tr', { hasText: 'IA-000001' })).toHaveCount(1);
  });

  await test.step('the API itself refuses an employee recording a payment', async () => {
    const login = await (await request.post(`${API}/employee/login`, { data: { shopId: shop.id, employeeId: employee.employeeId, password: 'EvePass123' } })).json();
    const agreements = await (await request.get(`${API}/sales/installment`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
    const pay = await request.post(`${API}/installments/${agreements.items[0]._id}/payments`, { headers: { Authorization: `Bearer ${login.token}` }, data: { amount: 100, method: 'CASH' } });
    expect(pay.status()).toBe(403);
  });

  await test.step('owner: full-price dashboard, employee filter and CSV export', async () => {
    await owner.goto('/partnerdashboard/sales/full-price');
    await expect(owner.locator('.metric-grid')).toBeVisible();
    const sales = owner.locator('section.data-page-card').last();
    await expect(sales.locator('tbody tr')).toHaveCount(2);
    await expect(owner.locator('.dashboard-two-col')).toContainText('Eve Seller');
    const [download] = await Promise.all([owner.waitForEvent('download'), owner.click('button:has-text("Export CSV")')]);
    expect(download.suggestedFilename()).toMatch(/full-price.*\.csv$/);
    await owner.selectOption('select:has(option:text("Sold by anyone"))', { label: `Eve Seller (${employee.employeeId})` });
    await expect(sales.locator('tbody tr')).toHaveCount(1);
  });

  await test.step('owner records an installment payment; overpayment is blocked', async () => {
    await owner.goto('/partnerdashboard/sales/installments');
    await owner.locator('tbody tr').first().locator('a.row-link').click();
    await expect(owner.locator('.detail-card')).toBeVisible();
    await owner.click('button:has-text("Record payment")');
    await expect(owner.locator('input[formcontrolname=amount]')).toHaveValue('33333.33');
    await owner.locator('input[formcontrolname=amount]').fill('200000');
    await owner.locator('input[formcontrolname=amount]').blur();
    await expect(owner.getByText('The amount is more than the remaining balance.')).toBeVisible();
    await owner.locator('input[formcontrolname=amount]').fill('33333.33');
    await owner.click('button:has-text("Save payment")');
    await expect(owner.locator('.record-success')).toBeVisible();
    await expect(owner.locator('.sale-facts')).toContainText('66,666.67');
    await expect(owner.locator('section.data-page-card').first().locator('tbody tr').first()).toContainText('Paid');
  });

  await test.step('owner refunds a sale with a reason; the unit stays sold', async () => {
    await owner.goto('/partnerdashboard/sales/history');
    await owner.locator('tbody tr', { hasText: 'S-000001' }).locator('a.row-link').click();
    await expect(owner.locator('.detail-card')).toBeVisible();
    await owner.click('button:has-text("Refund")');
    await expect(owner.locator('.confirm-dialog')).toBeVisible();
    await expect(owner.locator('.confirm-dialog button.btn')).toBeDisabled();
    await owner.locator('.confirm-dialog textarea').fill('Customer returned the box unopened');
    await owner.locator('.confirm-dialog button.btn').click();
    await expect(owner.locator('.record-success')).toBeVisible();
    await expect(owner.locator('.detail-header')).toContainText('Refunded');
    await owner.goto('/partnerdashboard');
    await expect(owner.locator('.metric-grid .metric-card').first()).toBeVisible();
    await expect(owner.locator('.activity-card')).toContainText('Eve Seller');
    expect(await text(owner, '.metric-grid')).toContain('Available units▤2');
  });

  await test.step('Urdu switches the whole page to right-to-left', async () => {
    await owner.locator('app-language-switch button', { hasText: 'اردو' }).click();
    await expect(owner.getByText('کل پروڈکٹ یونٹ')).toBeVisible();
    await expect(owner.locator('html')).toHaveAttribute('dir', 'rtl');
    await owner.locator('app-language-switch button', { hasText: 'English' }).click();
  });

  await test.step('phone width has no sideways scrolling', async () => {
    const phone = await employeeLogin(browser, shop, employee.employeeId, 'EvePass123', { width: 390, height: 844 });
    await expect(phone.getByText('Hello, Eve Seller')).toBeVisible();
    await expect(phone.locator('.metric-card').first()).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await phone.goto(phone.url() + '/inventory');
    await expect(phone.locator('tbody tr').first()).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await phone.context().close();
  });

  await emp.context().close();
  expect(errors, 'uncaught browser errors').toEqual([]);
});
