// Types for the Bizora Pilot API (backend/src/services/*.js). Mirrors the web app's
// frontend/src/app/features/products/product.models.ts and core services.
// Money is always integer paisa (…Cents); divide by 100 to show rupees.

export type UnitStatus = 'AVAILABLE' | 'SOLD_FULL_PRICE' | 'SOLD_INSTALLMENT';
export type SaleType = 'FULL_PRICE' | 'INSTALLMENT';
export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type AgreementStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type AgreementDisplayStatus = AgreementStatus | 'OVERDUE';
export type Frequency = 'MONTHLY' | 'WEEKLY' | 'CUSTOM';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];
export const FREQUENCIES: Frequency[] = ['MONTHLY', 'WEEKLY', 'CUSTOM'];

export interface Actor { type: 'owner' | 'employee'; id: string; name: string; employeeId: string; }
export interface Customer { name: string; phone: string; address?: string; reference?: string; }

// ---- auth

/** shopCode: the 6-character code employees enter to pick this shop (null only for shops the server hasn't backfilled yet). */
export interface Shop {
  id: string; shopName: string; slug: string; shopCode: string | null; ownerName: string; email: string; phone: string; address: string; timezone: string;
  /** Printed on receipts: National Tax Number, Sales Tax Registration Number, and the shop's own terms. */
  ntn: string; strn: string; receiptNote: string;
}
export interface EmployeeShop { id: string; shopName: string; slug: string; shopCode: string | null; timezone: string; }
/** accessRole: 'employee' (fixed permissions) or 'manager' (shop-wide operations, configurable by the owner). `role` is the job title. */
export type AccessRole = 'employee' | 'manager';
export interface EmployeeProfile { id: string; employeeId: string; name: string; email: string; role: string; accessRole?: AccessRole; mustChangePassword: boolean; }

/** What the server returns on login and refresh. Durations are in seconds. */
export interface SessionGrant { token: string; expiresIn: number; sessionEndsIn: number; }

export interface OwnerLoginResponse extends SessionGrant { shop: Shop; permissions: string[]; }
export interface EmployeeLoginResponse extends SessionGrant { employee: EmployeeProfile; shop: EmployeeShop; permissions: string[]; }

// ---- lists

export interface ListQuery { page: number; limit: number; search: string; sort: string; order: 'asc' | 'desc'; }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number; }
export interface Page<T> extends PageMeta { records: T[]; }
export type Filters = Record<string, string | number | boolean | null | undefined>;

export interface ProductCategory { name: string; subCategories: string[]; }

export interface Employee {
  _id: string;
  employeeId: string;
  mustChangePassword: boolean;
  name: string;
  email: string;
  phone: string;
  role: string;
  accessRole?: AccessRole;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}
export type EmployeeInput = Pick<Employee, 'name' | 'email' | 'phone' | 'role' | 'status'>;

// ---- inventory

export interface Product {
  _id: string;
  productCode: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  subCategory: string;
  description: string;
  imageUrls: string[];
  createdBy: Actor;
  createdAt: string;
  stock?: Record<UnitStatus, number>;
}

export interface InventoryUnit {
  _id: string;
  productId: string;
  productCode: string;
  productName: string;
  brand: string;
  model: string;
  category: string;
  subCategory: string;
  serialNumber: string;
  serialPending: boolean;
  /** Owner only (absent for employees). Null for migrated stock with unknown cost. */
  purchasePriceCents?: number | null;
  sellingPriceCents: number;
  supplier: { name: string; phone: string; invoiceRef: string };
  status: UnitStatus;
  addedBy: Actor;
  createdAt: string;
  saleId?: string;
  soldAt?: string;
}

export interface StockSummary {
  total: number; available: number; soldFullPrice: number; soldInstallment: number; needsSerial: number;
  availableSellingValueCents: number;
  availablePurchaseValueCents?: number;
  availableWithoutCost?: number;
}

export interface AddStockRequest {
  productId?: string;
  product?: { name: string; brand: string; model: string; category: string; subCategory: string; description?: string; imageUrls?: string[] };
  serialNumbers: string[];
  purchasePrice: number;
  sellingPrice: number;
  supplier?: { name?: string; phone?: string; invoiceRef?: string };
}

// ---- customers

export type DocumentKind = 'CNIC_FRONT' | 'CNIC_BACK' | 'OTHER';
export const DOCUMENT_KINDS: DocumentKind[] = ['CNIC_FRONT', 'CNIC_BACK', 'OTHER'];

export interface CustomerDocument { _id: string; kind: DocumentKind; contentType: string; size: number; uploadedBy: Actor; createdAt: string; }

export interface CustomerRecord {
  _id: string;
  customerCode: string;
  name: string;
  phone: string;
  /** 13 digits without dashes, or '' when unknown. */
  cnic: string;
  /** "12345-1234567-1" or ''. */
  cnicFormatted: string;
  address: string;
  notes: string;
  documents: CustomerDocument[];
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput { name: string; phone: string; cnic?: string; address?: string; notes?: string; }
export interface CustomerStats { salesCount: number; totalCents: number; activeAgreements: number; outstandingCents: number; overdueAgreements: number; overdueCents: number; }
export interface CustomerDetails { customer: CustomerRecord; sales: Sale[]; agreements: Agreement[]; stats: CustomerStats; }

// ---- sales

export interface Sale {
  _id: string;
  saleNumber: string;
  type: SaleType;
  unitId?: string;
  productId?: string;
  item: {
    productCode: string; productName: string; brand: string; model: string; category: string; subCategory: string;
    serialNumber: string; listPriceCents: number; purchasePriceCents?: number | null;
  };
  salePriceCents: number;
  discountCents: number;
  paymentMethod: PaymentMethod;
  /** The customer record this sale belongs to, when it has one. */
  customerId?: string;
  customer: Customer;
  note: string;
  soldBy: Actor;
  soldAt: string;
  status: SaleStatus;
  cancellation?: { at: string; by: Actor; reason: string };
  installmentAgreementId?: string;
  legacy?: { saleId: string; quantity: number };
  agreement?: Agreement | null;
}

export type InstallmentState = 'PAID' | 'PARTLY_PAID' | 'UPCOMING' | 'OVERDUE' | 'CANCELLED';

export interface ScheduleEntry { number: number; dueDate: string; amountCents: number; paidCents: number; state: InstallmentState; }

export interface Agreement {
  _id: string;
  agreementNumber: string;
  saleId: string;
  unitId?: string;
  item: { productName: string; serialNumber: string };
  customerId?: string;
  customer: Customer;
  totalPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  installmentCount: number;
  frequency: Frequency;
  intervalDays?: number;
  schedule: ScheduleEntry[];
  collectedCents: number;
  balanceCents: number;
  nextDueDate: string | null;
  nextDueCents: number | null;
  status: AgreementStatus;
  displayStatus: AgreementDisplayStatus;
  overdue: boolean;
  overdueCents: number;
  soldBy: Actor;
  notes: string;
  createdAt: string;
  cancellation?: { at: string; by: Actor; reason: string };
}

export interface Payment {
  _id: string;
  kind: 'DOWN_PAYMENT' | 'INSTALLMENT';
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  recordedBy: Actor;
  note: string;
}

/** `customerId` links an existing customer record; otherwise `customer` details are matched or saved as a record. */
export interface FullPriceSaleRequest {
  unitId: string; salePrice: number; paymentMethod: string; customerId?: string;
  customer?: { name?: string; phone?: string; address?: string; reference?: string }; note?: string;
}

export interface InstallmentSaleRequest {
  unitId: string; totalPrice: number; downPayment: number; installmentCount: number; frequency: string; intervalDays?: number;
  firstDueDate?: string; paymentMethod: string; customerId?: string; customer?: { name: string; phone: string; address?: string; reference?: string }; notes?: string;
}

// ---- dashboards

export interface PeriodTotals { count: number; valueCents: number; discountCents: number; todayCount: number; todayCents: number; weekCount: number; weekCents: number; monthCount: number; monthCents: number; }
export interface SeriesPoint { period: string; count: number; valueCents: number; }

export interface PartnerSummary {
  timezone: string; today: string;
  stock: StockSummary;
  customers: { total: number };
  sales: { totalValueCents: number; todayValueCents: number; todayCount: number; monthValueCents: number; fullPriceRevenueCents: number; installmentValueCents: number };
  collected: { fullPriceCents: number; downPaymentsCents: number; installmentPaymentsCents: number; totalCents: number };
  installments: { totalValueCents: number; outstandingCents: number; active: number; completed: number; cancelled: number; overdue: number; overdueCents: number };
}

export interface FullPriceStats {
  timezone: string; today: string; totals: PeriodTotals;
  series: { daily: SeriesPoint[]; weekly: SeriesPoint[]; monthly: SeriesPoint[] };
  byEmployee: { id: string; type: 'owner' | 'employee'; name: string; employeeId: string; count: number; valueCents: number }[];
}

export interface InstallmentStats {
  totalSalesValueCents: number; salesCount: number; downPaymentsCollectedCents: number; installmentPaymentsCollectedCents: number;
  totalCollectedCents: number; outstandingCents: number; overdueCents: number;
  overdueAgreements: number; activeAgreements: number; completedAgreements: number; cancelledAgreements: number;
}

export interface EmployeePerformance {
  id: string; type: 'owner' | 'employee'; name: string; employeeId: string; status?: string;
  unitsAdded: number; fullPriceCount: number; fullPriceCents: number; installmentCount: number; installmentCents: number; totalSalesCents: number;
}

export interface EmployeeSummary {
  timezone: string; today: string; unitsAdded: number; fullPriceCount: number; installmentCount: number;
  totalSalesCents: number; todaySalesCents: number; todayCount: number; monthSalesCents: number; monthCount: number;
  installments: { outstandingCents: number; overdue: number; active: number; completed: number };
}
