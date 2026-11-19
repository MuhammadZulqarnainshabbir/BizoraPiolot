import { employeePath } from '../employee-auth.service';
import { buildNav } from './nav-config';

const shop = { id: '6af4000000000000000000aa', slug: 'tenshop', shopName: 'Tenshop', timezone: 'Asia/Karachi' };
const employeeHome = employeePath(shop);

describe('buildNav', () => {
  it('shows Login / Register to visitors on the public site', () => {
    const nav = buildNav({ url: '/', ownerActive: false, employeeShop: null });
    expect(nav.role).toBe('guest');
    expect(nav.brand).toEqual({ commands: ['/'], portal: false });
    expect(nav.links.map(l => l.label)).toEqual(['Home', 'Features']);
    expect(nav.authActions).toBeTrue();
    expect(nav.logout).toBeFalse();
    expect(nav.search).toBeFalse();
  });

  it('keeps a shop’s employee login page minimal (no owner Login / Register)', () => {
    const nav = buildNav({ url: `/${shop.slug}/${shop.id}/employee/login`, ownerActive: false, employeeShop: null });
    expect(nav.role).toBe('guest');
    expect(nav.links).toEqual([]);
    expect(nav.authActions).toBeFalse();
  });

  it('points a signed-in owner at the partner portal, with search', () => {
    const nav = buildNav({ url: '/partnerdashboard/inventory', ownerActive: true, employeeShop: null });
    expect(nav.role).toBe('owner');
    expect(nav.brand).toEqual({ commands: ['/partnerdashboard'], portal: true });
    expect(nav.links[1]).toEqual({ label: 'Features', commands: ['/partnerdashboard'], fragment: 'shop-management' });
    expect(nav.search).toBeTrue();
    expect(nav.logout).toBeTrue();
  });

  it('points a signed-in employee at their shop’s portal', () => {
    const nav = buildNav({ url: `/${shop.slug}/${shop.id}/employee/inventory`, ownerActive: false, employeeShop: shop });
    expect(nav.role).toBe('employee');
    expect(nav.brand).toEqual({ commands: employeeHome, portal: true });
    expect(nav.links[0].commands).toEqual(employeeHome);
    expect(nav.search).toBeFalse();
    expect(nav.authActions).toBeFalse();
  });

  it('points a signed-in manager at the manager portal, on both manager and employee URLs', () => {
    const managerHome = ['/', shop.slug, shop.id, 'manager'];
    const nav = buildNav({ url: `/${shop.slug}/${shop.id}/manager/sales/history`, ownerActive: false, employeeShop: shop, employeeRole: 'manager' });
    expect(nav.role).toBe('employee');
    expect(nav.brand).toEqual({ commands: managerHome, portal: true });
    expect(nav.links[0].commands).toEqual(managerHome);
    expect(buildNav({ url: `/${shop.slug}/${shop.id}/employee`, ownerActive: false, employeeShop: shop, employeeRole: 'manager' }).brand.commands).toEqual(managerHome);
    expect(buildNav({ url: `/${shop.slug}/${shop.id}/manager`, ownerActive: true, employeeShop: shop, employeeRole: 'manager' }).role).toBe('employee');
  });

  it('treats another shop’s employee pages as a visitor, even with an employee session', () => {
    const nav = buildNav({ url: '/othershop/6af4000000000000000000bb/employee/login', ownerActive: false, employeeShop: shop });
    expect(nav.role).toBe('guest');
    expect(nav.links).toEqual([]);
  });

  it('prefers the owner portal on public pages when both sessions are active', () => {
    expect(buildNav({ url: '/', ownerActive: true, employeeShop: shop }).role).toBe('owner');
    expect(buildNav({ url: `/${shop.slug}/${shop.id}/employee`, ownerActive: true, employeeShop: shop }).role).toBe('employee');
  });
});
