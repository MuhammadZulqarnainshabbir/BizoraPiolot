import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { API_BASE } from '../../core/api';
import { ListQuery, Page, PageMeta, ProductCategory } from '../../core/shop-data.service';
import {
  Agreement, EmployeePerformance, EmployeeSummary, FullPriceStats, InstallmentStats, InventoryUnit, PartnerSummary,
  Payment, Product, Sale, StockSummary
} from './product.models';

type Filters = Record<string, string | number | boolean | null | undefined>;

/** Paging + sort + search + any extra filters (empty values are left out). */
function params(query: Partial<ListQuery> = {}, filters: Filters = {}): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries({ ...query, ...filters })) {
    if (value !== undefined && value !== null && value !== '') p = p.set(key, String(value));
  }
  return p;
}
const page = <T>(source: Observable<PageMeta & { items: T[] }>): Observable<Page<T>> =>
  source.pipe(map(({ items, ...meta }) => ({ records: items, ...meta })));

export interface AddStockRequest {
  productId?: string;
  product?: { name: string; brand: string; model: string; category: string; subCategory: string; description?: string; imageUrls?: string[] };
  serialNumbers: string[];
  purchasePrice: number;
  sellingPrice: number;
  supplier?: { name?: string; phone?: string; invoiceRef?: string };
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

/**
 * Inventory, sales, installments and dashboards. The same endpoints serve both portals: the
 * interceptor sends the current portal's token and the server applies that role's permissions.
 */
@Injectable({ providedIn: 'root' })
export class ProductsApiService {
  private http = inject(HttpClient);

  private categories$?: Observable<ProductCategory[]>;
  categories(): Observable<ProductCategory[]> {
    this.categories$ ??= this.http.get<{ categories: ProductCategory[] }>(`${API_BASE}/categories`).pipe(
      map(r => r.categories),
      catchError(error => { this.categories$ = undefined; return throwError(() => error); }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.categories$;
  }

  // ---- inventory
  addStock(body: AddStockRequest) { return this.http.post<{ product: Product; createdProduct: boolean; units: InventoryUnit[] }>(`${API_BASE}/products`, body); }
  units(query: ListQuery, filters: Filters = {}) { return page(this.http.get<PageMeta & { items: InventoryUnit[] }>(`${API_BASE}/products/units`, { params: params(query, filters) })); }
  products(query: ListQuery) { return page(this.http.get<PageMeta & { items: Product[] }>(`${API_BASE}/products`, { params: params(query) })); }
  product(id: string) { return this.http.get<{ product: Product; stock: Record<string, number>; units: InventoryUnit[] }>(`${API_BASE}/products/${encodeURIComponent(id)}`); }
  unit(id: string) { return this.http.get<{ unit: InventoryUnit; product: Product; sale: Partial<Sale> & { mine?: boolean } | null }>(`${API_BASE}/products/units/${encodeURIComponent(id)}`); }
  unitBySerial(serial: string) { return this.http.get<{ unit: InventoryUnit }>(`${API_BASE}/products/units/by-serial/${encodeURIComponent(serial)}`); }
  updateUnit(id: string, body: { serialNumber?: string; sellingPrice?: number; purchasePrice?: number; supplier?: object; reason?: string }) {
    return this.http.patch<{ unit: InventoryUnit }>(`${API_BASE}/products/units/${encodeURIComponent(id)}`, body);
  }
  deleteUnit(id: string, reason: string) { return this.http.delete<void>(`${API_BASE}/products/units/${encodeURIComponent(id)}`, { body: { reason } }); }
  stockSummary() { return this.http.get<{ summary: StockSummary }>(`${API_BASE}/products/stock-summary`).pipe(map(r => r.summary)); }

  // ---- sales
  sellFullPrice(body: FullPriceSaleRequest) { return this.http.post<{ sale: Sale }>(`${API_BASE}/sales/full-price`, body); }
  sellInstallment(body: InstallmentSaleRequest) { return this.http.post<{ sale: Sale; agreement: Agreement; payments: Payment[] }>(`${API_BASE}/sales/installment`, body); }
  fullPriceSales(query: ListQuery, filters: Filters = {}) { return page(this.http.get<PageMeta & { items: Sale[] }>(`${API_BASE}/sales/full-price`, { params: params(query, filters) })); }
  installmentSales(query: ListQuery, filters: Filters = {}) { return page(this.http.get<PageMeta & { items: Agreement[] }>(`${API_BASE}/sales/installment`, { params: params(query, filters) })); }
  /** Sales history of both kinds: the whole shop for the owner, own sales for employees. */
  sales(query: ListQuery, filters: Filters = {}) { return page(this.http.get<PageMeta & { items: Sale[] }>(`${API_BASE}/sales`, { params: params(query, filters) })); }
  mySales(query: ListQuery, filters: Filters = {}) { return page(this.http.get<PageMeta & { items: Sale[] }>(`${API_BASE}/sales/my-sales`, { params: params(query, filters) })); }
  sale(id: string) { return this.http.get<{ sale: Sale; agreement: Agreement | null; payments: Payment[] }>(`${API_BASE}/sales/${encodeURIComponent(id)}`); }
  correctSale(id: string, action: 'cancel' | 'refund', reason: string) {
    return this.http.post<{ sale: Sale; agreement: Agreement | null }>(`${API_BASE}/sales/${encodeURIComponent(id)}/${action}`, { reason });
  }
  /** CSV download (owner). Returns the file as a Blob so it can be saved with the server's file name. */
  exportSales(kind: 'full-price' | 'installment', filters: Filters = {}) {
    return this.http.get(`${API_BASE}/sales/${kind}/export`, { params: params({}, filters), responseType: 'blob', observe: 'response' });
  }

  // ---- receipts (PDF, generated by the server). Blob responses so the file name from the server can be used.
  saleReceipt(id: string) { return this.http.get(`${API_BASE}/sales/${encodeURIComponent(id)}/receipt.pdf`, { responseType: 'blob', observe: 'response' }); }
  paymentReceipt(agreementId: string, paymentId: string) {
    return this.http.get(`${API_BASE}/installments/${encodeURIComponent(agreementId)}/payments/${encodeURIComponent(paymentId)}/receipt.pdf`, { responseType: 'blob', observe: 'response' });
  }

  // ---- installments
  agreement(id: string) { return this.http.get<{ agreement: Agreement; sale: Sale | null; payments: Payment[] }>(`${API_BASE}/installments/${encodeURIComponent(id)}`); }
  recordPayment(id: string, body: { amount: number; method: string; note?: string }) {
    return this.http.post<{ agreement: Agreement; payment: Payment; payments: Payment[] }>(`${API_BASE}/installments/${encodeURIComponent(id)}/payments`, body);
  }

  // ---- dashboards
  partnerSummary() { return this.http.get<{ summary: PartnerSummary }>(`${API_BASE}/dashboard/partner/summary`).pipe(map(r => r.summary)); }
  fullPriceStats() { return this.http.get<{ stats: FullPriceStats }>(`${API_BASE}/dashboard/partner/full-price-sales`).pipe(map(r => r.stats)); }
  installmentStats() { return this.http.get<{ stats: InstallmentStats }>(`${API_BASE}/dashboard/partner/installment-sales`).pipe(map(r => r.stats)); }
  employeePerformance() { return this.http.get<{ items: EmployeePerformance[] }>(`${API_BASE}/dashboard/partner/employees`).pipe(map(r => r.items)); }
  employeeSummary() { return this.http.get<{ summary: EmployeeSummary }>(`${API_BASE}/dashboard/employee/summary`).pipe(map(r => r.summary)); }
}
