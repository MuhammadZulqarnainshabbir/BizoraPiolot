import { tk } from '../i18n/i18n.service';
import { AccessRole, EmployeeShop, employeePath, managerPath } from '../employee-auth.service';

/** Who the navigation bar is for. */
export type NavRole = 'guest' | 'owner' | 'employee';

export interface NavLink {
  /** English label; translated when rendered. */
  label: string;
  commands: string[];
  fragment?: string;
}

export interface NavConfig {
  role: NavRole;
  /** Where the Bizora Pilot logo leads. While signed in it's the "partner portal" link back to the user's portal. */
  brand: { commands: string[]; portal: boolean };
  links: NavLink[];
  /** Owner-only search box. */
  search: boolean;
  /** Owner Login / Register buttons. */
  authActions: boolean;
  logout: boolean;
}

export interface NavState {
  /** Current router URL. */
  url: string;
  /** An owner session that hasn't expired. */
  ownerActive: boolean;
  /** The shop of an employee session that hasn't expired, if any. */
  employeeShop: EmployeeShop | null;
  /** The staff session's access level; decides whether "home" is the manager or the employee portal. */
  employeeRole?: AccessRole;
}

const segments = (url: string) => url.split(/[?#]/)[0].split('/');
/** /:slug/:shopId/employee/... or /:slug/:shopId/manager/... (both use the staff session). */
export const isEmployeeUrl = (url: string) => segments(url)[3] === 'employee' || segments(url)[3] === 'manager';

/**
 * The navigation bar for each situation. This is the one place to change what the bar shows:
 * add a link to a role's `links`, or change where its logo leads.
 */
export function buildNav({ url, ownerActive, employeeShop, employeeRole }: NavState): NavConfig {
  const onEmployeePage = isEmployeeUrl(url);
  const urlShopId = segments(url)[2];
  const employeeHere = employeeShop && (!onEmployeePage || employeeShop.id === urlShopId);

  // Staff portal (employee or manager): on their shop's pages, or browsing the public site while signed in.
  if (employeeShop && employeeHere && (onEmployeePage || !ownerActive)) {
    const home = employeeRole === 'manager' ? managerPath(employeeShop) : employeePath(employeeShop);
    return {
      role: 'employee',
      brand: { commands: home, portal: true },
      links: [
        { label: tk('Home'), commands: home },
        { label: tk('Features'), commands: home, fragment: 'shop-management' }
      ],
      search: false,
      authActions: false,
      logout: true
    };
  }

  // Shop owner: Home and Features lead into the dashboard overview.
  if (ownerActive && !onEmployeePage) {
    return {
      role: 'owner',
      brand: { commands: ['/partnerdashboard'], portal: true },
      links: [
        { label: tk('Home'), commands: ['/partnerdashboard'] },
        { label: tk('Features'), commands: ['/partnerdashboard'], fragment: 'shop-management' }
      ],
      search: true,
      authActions: false,
      logout: true
    };
  }

  // Signed out. On a shop's employee login link, keep it minimal: no owner Login/Register.
  return {
    role: 'guest',
    brand: { commands: ['/'], portal: false },
    links: onEmployeePage ? [] : [
      { label: tk('Home'), commands: ['/'] },
      { label: tk('Features'), commands: ['/'], fragment: 'features' }
    ],
    search: false,
    authActions: !onEmployeePage,
    logout: false
  };
}
