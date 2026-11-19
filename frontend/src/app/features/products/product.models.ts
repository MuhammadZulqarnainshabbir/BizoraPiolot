// Types for the inventory and sales API (backend services/inventoryService.js, salesService.js).
// Money is always integer paisa (…Cents); divide by 100 to show rupees.

export type UnitStatus = 'AVAILABLE' | 'SOLD_FULL_PRICE' | 'SOLD_INSTALLMENT';
export type SaleType = 'FULL_PRICE' | 'INSTALLMENT';
export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type AgreementStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type AgreementDisplayStatus = AgreementStatus | 'OVERDUE';
export type Frequency = 'MONTHLY' | 'WEEKLY' | 'CUSTOM';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

export interface Actor { type: 'owner' | 'employee'; id: string; name: string; employeeId: string; }
export interface Customer { name: string; phone: string; address?: string; reference?: string; }

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
  /** Migrated stock with a placeholder serial; can't be sold until corrected. */
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
  /** The customer record (features/customers), when the sale has one. */
  customerId?: string;
  customer: Customer;
  note: string;
  soldBy: Actor;
  soldAt: string;
  status: SaleStatus;
  cancellation?: { at: string; by: Actor; reason: string };
  installmentAgreementId?: string;
  legacy?: { saleId: string; quantity: number };
  /** Attached by "my sales". */
  agreement?: Agreement | null;
}

export type InstallmentState = 'PAID' | 'PARTLY_PAID' | 'UPCOMING' | 'OVERDUE' | 'CANCELLED';

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
  schedule: { number: number; dueDate: string; amountCents: number; paidCents: number; state: InstallmentState }[];
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

export interface StockSummary {
  total: number; available: number; soldFullPrice: number; soldInstallment: number; needsSerial: number;
  availableSellingValueCents: number;
  /** Owner only. */
  availablePurchaseValueCents?: number;
  availableWithoutCost?: number;
}

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
