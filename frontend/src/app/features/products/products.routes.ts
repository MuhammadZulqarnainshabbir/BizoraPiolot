import { Routes } from '@angular/router';

/**
 * Inventory and sales pages, shared by both portals (lazy-loaded under /partnerdashboard and
 * /:slug/:shopId/employee). Each page shows only what the signed-in role may do; the server
 * enforces the same rules.
 */
export const PRODUCT_ROUTES: Routes = [
  { path: 'inventory', loadComponent: () => import('./product-list.component').then(m => m.ProductListComponent) },
  { path: 'inventory/add', loadComponent: () => import('./add-product.component').then(m => m.AddProductComponent) },
  { path: 'inventory/products', loadComponent: () => import('./product-stock.component').then(m => m.ProductStockComponent) },
  { path: 'inventory/units/:unitId', loadComponent: () => import('./product-details.component').then(m => m.ProductDetailsComponent) },
  { path: 'sell/full-price/:unitId', loadComponent: () => import('./full-price-sale-form.component').then(m => m.FullPriceSaleFormComponent) },
  { path: 'sell/installment/:unitId', loadComponent: () => import('./installment-sale-form.component').then(m => m.InstallmentSaleFormComponent) },
  { path: 'sales', pathMatch: 'full', redirectTo: 'sales/full-price' },
  { path: 'sales/full-price', loadComponent: () => import('./full-price-sales.component').then(m => m.FullPriceSalesComponent) },
  { path: 'sales/installments', loadComponent: () => import('./installment-sales.component').then(m => m.InstallmentSalesComponent) },
  { path: 'sales/installments/:id', loadComponent: () => import('./installment-details.component').then(m => m.InstallmentDetailsComponent) },
  { path: 'sales/history', loadComponent: () => import('./product-sales-history.component').then(m => m.ProductSalesHistoryComponent) },
  { path: 'sales/:id', loadComponent: () => import('./sale-details.component').then(m => m.SaleDetailsComponent) },
  // Customer records (both portals).
  { path: 'customers', loadComponent: () => import('../customers/customer-list.component').then(m => m.CustomerListComponent) },
  { path: 'customers/new', loadComponent: () => import('../customers/customer-form.component').then(m => m.CustomerFormComponent) },
  { path: 'customers/:id', loadComponent: () => import('../customers/customer-details.component').then(m => m.CustomerDetailsComponent) },
  { path: 'customers/:id/edit', loadComponent: () => import('../customers/customer-form.component').then(m => m.CustomerFormComponent) }
];
