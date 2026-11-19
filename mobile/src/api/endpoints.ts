import { del, get, patch, post, put, requestBytes, requestText } from './client';
import type {
  AddStockRequest, Agreement, CustomerDetails, CustomerDocument, CustomerInput, CustomerRecord, DocumentKind, Employee, EmployeeInput,
  EmployeeLoginResponse, EmployeePerformance, EmployeeProfile, EmployeeShop, EmployeeSummary, Filters, FullPriceSaleRequest, FullPriceStats,
  InstallmentSaleRequest, InstallmentStats, InventoryUnit, ListQuery, OwnerLoginResponse, Page, PageMeta, PartnerSummary, Payment, Product,
  ProductCategory, Sale, SessionGrant, Shop, StockSummary
} from './models';

// Every endpoint of the API, typed. Same routes as the web app's services; the server applies
// the signed-in role's permissions (backend/src/config/permissions.js).

const enc = encodeURIComponent;
const listQuery = (query: Partial<ListQuery>, filters: Filters = {}) => ({ ...query, ...filters });
const toPage = <T>(items: T[], meta: PageMeta): Page<T> => ({ records: items, page: meta.page, limit: meta.limit, total: meta.total, totalPages: meta.totalPages });

// ---- owner auth
export const auth = {
  register: (data: Record<string, string>) => post<{ message: string; shop: Shop }>('/auth/register-shop', data, { auth: false }),
  login: (email: string, password: string) => post<OwnerLoginResponse>('/auth/login', { email, password }, { auth: false }),
  forgotPassword: (email: string) => post<{ message: string }>('/auth/forgot-password', { email }, { auth: false }),
  resetPassword: (token: string, password: string, confirmPassword: string) => post<{ message: string }>('/auth/reset-password', { token, password, confirmPassword }, { auth: false }),
  me: () => get<{ shop: Shop; permissions: string[] }>('/auth/me'),
  refresh: () => post<SessionGrant>('/auth/refresh'),
  /** Only the fields sent change. */
  updateSettings: (settings: { timezone?: string; ntn?: string; strn?: string; receiptNote?: string }) => patch<{ shop: Shop }>('/auth/shop-settings', settings)
};

// ---- employee auth
export const employeeAuth = {
  shopInfo: (shopId: string) => get<{ shop: EmployeeShop }>(`/employee/shops/${enc(shopId)}`),
  shopInfoByCode: (code: string) => get<{ shop: EmployeeShop }>(`/employee/shops/by-code/${enc(code)}`),
  /** The server finds the shop by its code and checks the employee belongs to that shop. */
  login: (shopCode: string, employeeId: string, password: string) => post<EmployeeLoginResponse>('/employee/login', { shopCode, employeeId, password }, { auth: false }),
  me: () => get<{ employee: EmployeeProfile; shop: EmployeeShop; permissions: string[] }>('/employee/me'),
  /** Also returns the current profile and permissions, so promotions and permission changes reach the app at the next renewal. */
  refresh: () => post<SessionGrant & { employee?: EmployeeProfile; shop?: EmployeeShop; permissions?: string[] }>('/employee/refresh'),
  changePassword: (currentPassword: string, password: string, confirmPassword: string) =>
    post<SessionGrant & { employee: EmployeeProfile }>('/employee/change-password', { currentPassword, password, confirmPassword })
};

// ---- employees (owner)
export const employees = {
  list: async (query: Partial<ListQuery>) => {
    const { employees: items, ...meta } = await get<PageMeta & { employees: Employee[] }>('/employees', listQuery(query));
    return toPage(items, meta);
  },
  /** Job titles for the Role dropdown (the server refuses anything else). */
  roles: async () => (await get<{ roles: string[] }>('/employees/roles')).roles,
  create: (data: EmployeeInput & { password: string }) => post<{ employee: Employee }>('/employees', data),
  update: (id: string, data: EmployeeInput) => put<{ employee: Employee }>(`/employees/${enc(id)}`, data),
  resetPassword: (id: string, password: string) => post<{ employee: Employee }>(`/employees/${enc(id)}/password`, { password }),
  remove: (id: string) => del<void>(`/employees/${enc(id)}`)
};

// ---- customers (both roles; the server applies permissions)
export const customers = {
  list: async (query: Partial<ListQuery>) => {
    const { items, ...meta } = await get<PageMeta & { items: CustomerRecord[] }>('/customers', listQuery(query));
    return toPage(items, meta);
  },
  /** First few matches for a name, phone or CNIC (the sale forms' picker). */
  search: async (term: string, limit = 8) => (await customers.list({ page: 1, limit, search: term, sort: 'name', order: 'asc' })).records,
  get: (id: string) => get<CustomerDetails>(`/customers/${enc(id)}`),
  create: (data: CustomerInput) => post<{ customer: CustomerRecord }>('/customers', data),
  update: (id: string, data: Partial<CustomerInput> & { reason?: string }) => patch<{ customer: CustomerRecord }>(`/customers/${enc(id)}`, data),
  remove: (id: string, reason: string) => del<void>(`/customers/${enc(id)}`, { reason }),
  /** `image` is a data URL (data:image/jpeg;base64,…). */
  addDocument: (id: string, kind: DocumentKind, image: string) => post<{ document: CustomerDocument }>(`/customers/${enc(id)}/documents`, { kind, image }),
  document: (id: string, docId: string) => get<{ document: CustomerDocument & { dataUrl: string } }>(`/customers/${enc(id)}/documents/${enc(docId)}`),
  removeDocument: (id: string, docId: string) => del<void>(`/customers/${enc(id)}/documents/${enc(docId)}`)
};

// ---- inventory
export const inventory = {
  categories: async () => (await get<{ categories: ProductCategory[] }>('/categories')).categories,
  addStock: (body: AddStockRequest) => post<{ product: Product; createdProduct: boolean; units: InventoryUnit[] }>('/products', body),
  units: async (query: Partial<ListQuery>, filters: Filters = {}) => {
    const { items, ...meta } = await get<PageMeta & { items: InventoryUnit[] }>('/products/units', listQuery(query, filters));
    return toPage(items, meta);
  },
  products: async (query: Partial<ListQuery>) => {
    const { items, ...meta } = await get<PageMeta & { items: Product[] }>('/products', listQuery(query));
    return toPage(items, meta);
  },
  product: (id: string) => get<{ product: Product; stock: Record<string, number>; units: InventoryUnit[] }>(`/products/${enc(id)}`),
  unit: (id: string) => get<{ unit: InventoryUnit; product: Product; sale: (Partial<Sale> & { mine?: boolean }) | null }>(`/products/units/${enc(id)}`),
  unitBySerial: (serial: string) => get<{ unit: InventoryUnit; product: Product; sale: (Partial<Sale> & { mine?: boolean }) | null }>(`/products/units/by-serial/${enc(serial)}`),
  updateUnit: (id: string, body: { serialNumber?: string; sellingPrice?: number; purchasePrice?: number; supplier?: object; reason?: string }) =>
    patch<{ unit: InventoryUnit }>(`/products/units/${enc(id)}`, body),
  deleteUnit: (id: string, reason: string) => del<void>(`/products/units/${enc(id)}`, { reason }),
  stockSummary: async () => (await get<{ summary: StockSummary }>('/products/stock-summary')).summary
};

// ---- sales
export const sales = {
  sellFullPrice: (body: FullPriceSaleRequest) => post<{ sale: Sale }>('/sales/full-price', body),
  sellInstallment: (body: InstallmentSaleRequest) => post<{ sale: Sale; agreement: Agreement; payments: Payment[] }>('/sales/installment', body),
  fullPrice: async (query: Partial<ListQuery>, filters: Filters = {}) => {
    const { items, ...meta } = await get<PageMeta & { items: Sale[] }>('/sales/full-price', listQuery(query, filters));
    return toPage(items, meta);
  },
  installment: async (query: Partial<ListQuery>, filters: Filters = {}) => {
    const { items, ...meta } = await get<PageMeta & { items: Agreement[] }>('/sales/installment', listQuery(query, filters));
    return toPage(items, meta);
  },
  /** Both kinds: the whole shop for the owner, own sales for employees. */
  history: async (query: Partial<ListQuery>, filters: Filters = {}) => {
    const { items, ...meta } = await get<PageMeta & { items: Sale[] }>('/sales', listQuery(query, filters));
    return toPage(items, meta);
  },
  get: (id: string) => get<{ sale: Sale; agreement: Agreement | null; payments: Payment[] }>(`/sales/${enc(id)}`),
  correct: (id: string, action: 'cancel' | 'refund', reason: string) => post<{ sale: Sale; agreement: Agreement | null }>(`/sales/${enc(id)}/${action}`, { reason }),
  exportCsv: (kind: 'full-price' | 'installment', filters: Filters = {}) => requestText(`/sales/${kind}/export`, filters),
  /** PDF receipt (full-price receipt, or installment agreement with schedule and payments). */
  receiptPdf: (id: string) => requestBytes(`/sales/${enc(id)}/receipt.pdf`)
};

// ---- installments
export const installments = {
  get: (id: string) => get<{ agreement: Agreement; sale: Sale | null; payments: Payment[] }>(`/installments/${enc(id)}`),
  recordPayment: (id: string, body: { amount: number; method: string; note?: string }) =>
    post<{ agreement: Agreement; payment: Payment; payments: Payment[] }>(`/installments/${enc(id)}/payments`, body),
  /** PDF receipt for one payment. */
  paymentReceiptPdf: (id: string, paymentId: string) => requestBytes(`/installments/${enc(id)}/payments/${enc(paymentId)}/receipt.pdf`)
};

// ---- dashboards
export const dashboard = {
  partnerSummary: async () => (await get<{ summary: PartnerSummary }>('/dashboard/partner/summary')).summary,
  fullPriceStats: async () => (await get<{ stats: FullPriceStats }>('/dashboard/partner/full-price-sales')).stats,
  installmentStats: async () => (await get<{ stats: InstallmentStats }>('/dashboard/partner/installment-sales')).stats,
  employeePerformance: async () => (await get<{ items: EmployeePerformance[] }>('/dashboard/partner/employees')).items,
  employeeSummary: async () => (await get<{ summary: EmployeeSummary }>('/dashboard/employee/summary')).summary
};
