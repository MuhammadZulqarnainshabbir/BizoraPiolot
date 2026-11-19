import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * HTTP client for the Bizora Pilot API.
 *
 * The web app calls the API at a relative URL; a phone can't, so the base URL is resolved here:
 *   1. a server address saved in the app ("Server" screen),
 *   2. EXPO_PUBLIC_API_URL from mobile/.env,
 *   3. the computer running `npx expo start` (Expo's dev-server host) on port 3000.
 * The third option means Expo Go on a phone on the same Wi-Fi reaches `npm run dev` in backend/
 * with no configuration at all.
 */

const SERVER_KEY = 'bizora_api_url';
const DEFAULT_PORT = 3000;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** The server's message for an error, or `fallback` for anything that isn't an API response. */
export function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback;
}

export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_PORT}/api/v1`;
  return `http://localhost:${DEFAULT_PORT}/api/v1`;
}

let baseUrl = defaultApiUrl();
let token: string | null = null;
let unauthorizedHandler: ((message: string) => void) | null = null;

export const getApiUrl = () => baseUrl;

export async function loadApiUrl(): Promise<string> {
  try {
    const stored = (await AsyncStorage.getItem(SERVER_KEY))?.trim();
    baseUrl = stored || defaultApiUrl();
  } catch {
    baseUrl = defaultApiUrl();
  }
  return baseUrl;
}

/** Saves a custom server address; an empty value returns to the automatic default. */
export async function saveApiUrl(url: string): Promise<string> {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) await AsyncStorage.setItem(SERVER_KEY, clean);
  else await AsyncStorage.removeItem(SERVER_KEY);
  baseUrl = clean || defaultApiUrl();
  return baseUrl;
}

export function setToken(value: string | null) { token = value; }
export function getToken() { return token; }

/** Called when the server rejects the current token (401), i.e. the session is over. */
export function setUnauthorizedHandler(handler: ((message: string) => void) | null) { unauthorizedHandler = handler; }

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** false for login/registration (no token, and a 401 doesn't end the session). */
  auth?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `${url}?${parts.join('&')}` : url;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, `Can’t reach the server at ${baseUrl}. Make sure the API is running and your phone is on the same Wi-Fi network.`, 'NETWORK');
  }
}

async function failure(res: Response, options: RequestOptions): Promise<ApiError> {
  let data: { message?: string; code?: string; details?: unknown } | null = null;
  try { data = await res.json(); } catch { data = null; }
  const message = data?.message || `Request failed (${res.status})`;
  // 401: the session is over. 403 SHOP_*: the platform suspended, deactivated or hasn't approved the shop; sign out with the reason.
  const shopBlocked = res.status === 403 && typeof data?.code === 'string' && data.code.startsWith('SHOP_');
  if ((res.status === 401 || shopBlocked) && options.auth !== false && token) unauthorizedHandler?.(message);
  return new ApiError(res.status, message, data?.code, data?.details);
}

/** JSON request. Resolves with the parsed body (undefined for 204). */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (!res.ok) throw await failure(res, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Text request (CSV export). Returns the body and the file name the server suggested. */
export async function requestText(path: string, query?: Query): Promise<{ text: string; filename: string | null }> {
  const res = await send(path, { query });
  if (!res.ok) throw await failure(res, {});
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? null;
  return { text: await res.text(), filename };
}

/** Binary request (PDF receipts). Returns the bytes and the file name the server suggested. */
export async function requestBytes(path: string, query?: Query): Promise<{ bytes: Uint8Array; filename: string | null; contentType: string }> {
  const res = await send(path, { query });
  if (!res.ok) throw await failure(res, {});
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), filename, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

export const get = <T>(path: string, query?: Query) => request<T>(path, { query });
export const post = <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...options, method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body });
