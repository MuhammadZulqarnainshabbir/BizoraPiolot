// Input helpers shared by the forms (same rules as the web app's shared.ts).

/** Rupee text → integer paisa (0 when empty or not a number). */
export const toCents = (value: unknown) => Math.round((Number(value) || 0) * 100);

/** True when the text is an amount with at most 2 decimals, ≥ 0 (or > 0 when `allowZero` is false). */
export function isMoney(value: string, { allowZero = true, required = true } = {}): boolean {
  const trimmed = value.trim();
  if (!trimmed) return !required;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return false;
  return Math.abs(Math.round(n * 100) - n * 100) <= 1e-6;
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Serial numbers from a multi-line field: one per line, trimmed, blanks ignored. */
export function parseSerials(text: string): string[] {
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

/** Serials that appear more than once (ignoring case and spaces, like the server). */
export function duplicateSerials(serials: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const s of serials) {
    const key = s.replace(/\s+/g, '').toUpperCase();
    if (seen.has(key)) dupes.add(s); else seen.add(key);
  }
  return [...dupes];
}

/** Links from a multi-line field; valid when ≤ 5 and each starts with http(s)://. */
export function parseImageUrls(text: string): { urls: string[]; valid: boolean } {
  const urls = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return { urls, valid: urls.length <= 5 && urls.every(u => /^https?:\/\/\S+$/i.test(u)) };
}

// Shop codes (backend/src/services/shopCodes.js): 6 characters, no 0/O or 1/I.
const SHOP_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Uppercases and drops spaces and dashes, so "7k3q-m2" and "7K3Q M2" both mean "7K3QM2". */
export const normalizeShopCode = (value: string) => value.replace(/[\s-]+/g, '').toUpperCase();

export const isShopCode = (value: string) => SHOP_CODE_PATTERN.test(normalizeShopCode(value));
