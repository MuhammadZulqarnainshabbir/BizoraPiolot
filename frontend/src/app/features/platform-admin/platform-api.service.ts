import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE } from '../../core/api';
import { PlatformAdmin } from './platform-auth.service';

// Typed access to /api/v1/platform-admin. Every call carries the platform token (see auth.interceptor.ts).

export type ShopStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface PlatformPage<T> { items: T[]; page: number; limit: number; total: number; totalPages: number; }

export interface ShopSummary {
  _id: string; shopName: string; slug: string; shopCode: string | null; ownerName: string; email: string; phone: string; address: string; timezone: string;
  ntn: string; strn: string; status: ShopStatus; statusReason: string; statusChangedAt: string | null; statusChangedBy: string;
  lastActivityAt: string | null; createdAt: string; updatedAt: string;
  subscription: { planKey: string; status: SubscriptionStatus; endsAt: string | null; trialEndsAt: string | null } | null;
}

export interface Plan {
  key: string; name: string; description: string; priceCents: number; billingPeriod: 'MONTH' | 'YEAR'; trialDays: number;
  limits: { maxEmployees: number | null; maxInventoryUnits: number | null; maxBranches: number | null };
  features: string[]; active: boolean; sortOrder: number;
}

export interface FeatureInfo { key: string; label: string; description: string; deployed: boolean; }

export interface Subscription {
  _id?: string; shopId: string; planKey: string; status: SubscriptionStatus; startsAt: string; endsAt: string | null; trialEndsAt: string | null;
  billingReference: string; notes: string; updatedAt?: string;
  shop?: { shopName: string; shopCode: string | null; status: ShopStatus } | null;
}

export interface Entitlements {
  planKey: string; planName: string; subscriptionStatus: string; usingDefaultPlan: boolean; lapsed: boolean;
  endsAt: string | null; trialEndsAt: string | null;
  limits: Plan['limits']; features: string[];
  overrides: { featureKey: string; enabled: boolean; reason: string }[];
  catalog: { key: string; label: string; deployed: boolean; enabled: boolean }[];
}

export interface AuditEntry {
  _id: string; adminId?: string; adminEmail: string; action: string; targetType: string; targetId: string; targetLabel: string;
  reason: string; before?: unknown; after?: unknown; ip: string; outcome: 'success' | 'failure'; createdAt: string;
}

export interface ShopDetails {
  shop: ShopSummary;
  counts: { employees: number; managers: number; units: number; products: number; completedSales: number; activeAgreements: number; customers: number };
  subscription: Subscription | null;
  entitlements: Entitlements;
  platformHistory: AuditEntry[];
}

export interface ShopDiagnostics extends ShopDetails {
  restrictions: { kind: string; message: string; featureKey?: string }[];
  activity: { lastSaleAt: string | null; lastStockAddedAt: string | null; lastActivityAt: string | null };
  staff: Record<string, number>;
  recentShopAudit: { action: string; entityType: string; by: string; at: string }[];
}

export interface ApiMetrics {
  since: string; uptimeSeconds: number;
  totals: { requests: number; status2xx: number; status3xx: number; status4xx: number; status5xx: number; avgLatencyMs: number; errorRate: number };
  hourly: { hour: string; requests: number; status4xx: number; status5xx: number; avgLatencyMs: number }[];
}

export interface Dashboard {
  shops: { total: number } & Record<ShopStatus, number>;
  users: { owners: number; activeEmployees: number; managers: number };
  subscriptions: { byStatus: Record<string, number>; byPlan: Record<string, number>; onDefaultPlan: number; mrrCents: number; pricesConfigured: boolean };
  recentShops: ShopSummary[];
  recentActivity: AuditEntry[];
  api: ApiMetrics;
  settings: { registrationApproval: 'automatic' | 'manual'; defaultPlanKey: string };
}

export interface Analytics {
  range: { from: string; to: string };
  registrationsByMonth: { month: string; count: number }[];
  salesByMonth: { month: string; count: number }[];
  unitsAddedByMonth: { month: string; count: number }[];
  shops: Dashboard['shops'];
  subscriptions: Dashboard['subscriptions'];
  users: { owners: number; employees: number; managers: number };
  records: { products: number; units: number; sales: number; activeAgreements: number; customers: number };
  featureAdoption: { key: string; label: string; shops: number }[];
  api: ApiMetrics;
}

export interface PlatformSettings {
  registrationApproval: 'automatic' | 'manual'; defaultPlanKey: string; suspensionMessage: string; supportEmail: string;
}

export interface Health {
  status: string; database: string; node: string; uptimeSeconds: number; memoryMb: { rss: number; heapUsed: number }; mongooseState: number; now: string;
}

export interface PermissionInfo { key: string; label: string; roles: string[]; }

const params = (query: Record<string, string | number | undefined | null>) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  return p;
};

@Injectable({ providedIn: 'root' })
export class PlatformApiService {
  private http = inject(HttpClient);
  private api = `${API_BASE}/platform-admin`;

  dashboard() { return this.http.get<Dashboard>(`${this.api}/dashboard`); }
  analytics(query: { from?: string; to?: string } = {}) { return this.http.get<Analytics>(`${this.api}/analytics`, { params: params(query) }); }
  health() { return this.http.get<Health>(`${this.api}/health`); }

  shops(query: Record<string, string | number | undefined>) { return this.http.get<PlatformPage<ShopSummary>>(`${this.api}/shops`, { params: params(query) }); }
  shop(id: string) { return this.http.get<ShopDetails>(`${this.api}/shops/${id}`); }
  diagnostics(id: string) { return this.http.get<ShopDiagnostics>(`${this.api}/shops/${id}/diagnostics`); }
  transition(id: string, action: 'approve' | 'suspend' | 'reactivate' | 'deactivate', reason: string) {
    return this.http.post<{ shop: ShopSummary }>(`${this.api}/shops/${id}/${action}`, { reason });
  }
  setSubscription(id: string, body: Partial<Subscription> & { reason?: string }) {
    return this.http.put<{ subscription: Subscription; entitlements: Entitlements }>(`${this.api}/shops/${id}/subscription`, body);
  }
  setFeature(id: string, key: string, enabled: boolean, reason: string) {
    return this.http.put<{ entitlements: Entitlements }>(`${this.api}/shops/${id}/features/${key}`, { enabled, reason });
  }
  clearFeature(id: string, key: string) { return this.http.delete<{ entitlements: Entitlements }>(`${this.api}/shops/${id}/features/${key}`); }

  admins(query: Record<string, string | number | undefined> = {}) {
    return this.http.get<PlatformPage<PlatformAdmin> & { roles: string[]; permissions: PermissionInfo[] }>(`${this.api}/administrators`, { params: params(query) });
  }
  createAdmin(body: { email: string; name: string; role: string }) {
    return this.http.post<{ admin: PlatformAdmin; temporaryPassword: string }>(`${this.api}/administrators`, body);
  }
  updateAdmin(id: string, body: { name?: string; role?: string; status?: string; reason?: string }) {
    return this.http.patch<{ admin: PlatformAdmin }>(`${this.api}/administrators/${id}`, body);
  }
  revokeSessions(id: string, reason: string) { return this.http.post<void>(`${this.api}/administrators/${id}/revoke-sessions`, { reason }); }
  resetPassword(id: string, reason: string) { return this.http.post<{ temporaryPassword: string }>(`${this.api}/administrators/${id}/reset-password`, { reason }); }

  plans() { return this.http.get<{ plans: Plan[]; features: FeatureInfo[]; statuses: SubscriptionStatus[] }>(`${this.api}/plans`); }
  createPlan(body: Partial<Plan>) { return this.http.post<{ plan: Plan }>(`${this.api}/plans`, body); }
  updatePlan(key: string, body: Partial<Plan> & { reason?: string }) { return this.http.patch<{ plan: Plan }>(`${this.api}/plans/${key}`, body); }
  subscriptions(query: Record<string, string | number | undefined> = {}) { return this.http.get<PlatformPage<Subscription>>(`${this.api}/subscriptions`, { params: params(query) }); }
  features() { return this.http.get<{ features: FeatureInfo[]; plans: Plan[] }>(`${this.api}/features`); }

  auditLogs(query: Record<string, string | number | undefined> = {}) {
    return this.http.get<PlatformPage<AuditEntry> & { actions: string[] }>(`${this.api}/audit-logs`, { params: params(query) });
  }

  settings() { return this.http.get<{ settings: PlatformSettings; shopStatuses: ShopStatus[] }>(`${this.api}/settings`); }
  updateSettings(body: Partial<PlatformSettings>) { return this.http.patch<{ settings: PlatformSettings }>(`${this.api}/settings`, body); }
}

/** The message of an API error, or a fallback. */
export const apiMessage = (error: unknown, fallback = 'Something went wrong'): string =>
  (error as { error?: { message?: string } })?.error?.message || fallback;

export const money = (cents: number | null | undefined) => `Rs ${((cents ?? 0) / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
