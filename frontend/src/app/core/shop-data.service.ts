import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE } from './api';

export interface ListQuery {
  page: number;
  limit: number;
  search: string;
  sort: string;
  order: 'asc' | 'desc';
}

export interface Page<T> {
  records: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type PageMeta = Omit<Page<unknown>, 'records'>;

export function listParams(query: ListQuery): HttpParams {
  let params = new HttpParams()
    .set('page', query.page)
    .set('limit', query.limit)
    .set('sort', query.sort)
    .set('order', query.order);
  if (query.search) params = params.set('search', query.search);
  return params;
}

/** A product category and its sub-categories, as served by GET /api/v1/categories. */
export interface ProductCategory {
  name: string;
  subCategories: string[];
}

export type AccessRole = 'employee' | 'manager';
export interface PermissionOverrides { allow: string[]; deny: string[]; }

export interface Employee {
  _id: string;
  /** Human-readable login ID, unique within the shop (e.g. EMP-0001). */
  employeeId: string;
  mustChangePassword: boolean;
  name: string;
  email: string;
  phone: string;
  /** Job title. Access is decided by `accessRole`. */
  role: string;
  accessRole: AccessRole;
  /** Owner-only in responses. */
  permissionOverrides?: PermissionOverrides;
  permissionsUpdatedAt?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export type EmployeeInput = Pick<Employee, 'name' | 'email' | 'phone' | 'role' | 'status'>;

/** One entry of the permission registry (backend config/permissions.js). */
export interface PermissionInfo { key: string; label: string; group: string; roles: string[]; grantable: boolean; }
export interface PermissionRegistry { permissions: PermissionInfo[]; grantable: string[]; defaults: Record<'owner' | 'manager' | 'employee', string[]>; }

/** An employee's permission picture: role defaults, what the owner may change, the overrides, and the result. */
export interface PermissionView {
  accessRole: AccessRole;
  defaults: string[];
  grantable: string[];
  overrides: PermissionOverrides;
  effective: string[];
  updatedAt: string | null;
  updatedBy: { type: string; name: string; employeeId?: string } | null;
}

export interface PermissionHistoryEntry {
  _id: string;
  action: string;
  actor: { type: string; name: string; employeeId?: string };
  reason: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}

export interface EmployeePermissionsResponse { employee: Employee; permissions: PermissionView; history: PermissionHistoryEntry[]; }

@Injectable({ providedIn: 'root' })
export class ShopDataService {
  private http = inject(HttpClient);
  private api = API_BASE;

  employees(query: ListQuery): Observable<Page<Employee>> {
    return this.http
      .get<PageMeta & { employees: Employee[] }>(`${this.api}/employees`, { params: listParams(query) })
      .pipe(map(({ employees, ...meta }) => ({ records: employees, ...meta })));
  }

  /** `password` is the temporary password the employee must change at first login. `accessRole: 'manager'` creates a manager straight away. */
  createEmployee(data: EmployeeInput & { password: string; accessRole?: AccessRole }): Observable<{ employee: Employee }> {
    return this.http.post<{ employee: Employee }>(`${this.api}/employees`, data);
  }

  /** Job titles for the Role dropdown (the server refuses anything else). */
  jobRoles(): Observable<string[]> {
    return this.http.get<{ roles: string[] }>(`${this.api}/employees/roles`).pipe(map(r => r.roles));
  }

  /** Only the managers. */
  managers(query: ListQuery): Observable<Page<Employee>> {
    return this.http
      .get<PageMeta & { employees: Employee[] }>(`${this.api}/employees/managers`, { params: listParams(query) })
      .pipe(map(({ employees, ...meta }) => ({ records: employees, ...meta })));
  }

  // ---- managers (owner only)
  permissionRegistry(): Observable<PermissionRegistry> {
    return this.http.get<PermissionRegistry>(`${this.api}/employees/permissions/registry`);
  }
  employeePermissions(id: string): Observable<EmployeePermissionsResponse> {
    return this.http.get<EmployeePermissionsResponse>(`${this.api}/employees/${encodeURIComponent(id)}/permissions`);
  }
  promoteManager(id: string, reason: string, permissionOverrides?: PermissionOverrides): Observable<{ employee: Employee; permissions: PermissionView }> {
    return this.http.post<{ employee: Employee; permissions: PermissionView }>(`${this.api}/employees/${encodeURIComponent(id)}/promote-manager`, { reason, ...(permissionOverrides ? { permissionOverrides } : {}) });
  }
  demoteManager(id: string, reason: string): Observable<{ employee: Employee; permissions: PermissionView }> {
    return this.http.post<{ employee: Employee; permissions: PermissionView }>(`${this.api}/employees/${encodeURIComponent(id)}/demote-manager`, { reason });
  }
  updatePermissions(id: string, permissionOverrides: PermissionOverrides, reason: string): Observable<{ employee: Employee; permissions: PermissionView }> {
    return this.http.patch<{ employee: Employee; permissions: PermissionView }>(`${this.api}/employees/${encodeURIComponent(id)}/permissions`, { permissionOverrides, reason });
  }

  resetEmployeePassword(id: string, password: string): Observable<{ employee: Employee }> {
    return this.http.post<{ employee: Employee }>(`${this.api}/employees/${encodeURIComponent(id)}/password`, { password });
  }

  updateEmployee(id: string, data: EmployeeInput): Observable<{ employee: Employee }> {
    return this.http.put<{ employee: Employee }>(`${this.api}/employees/${encodeURIComponent(id)}`, data);
  }

  deleteEmployee(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/employees/${encodeURIComponent(id)}`);
  }
}
