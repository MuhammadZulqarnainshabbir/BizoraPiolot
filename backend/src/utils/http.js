import mongoose from 'mongoose';
import { PAYMENT_METHODS } from '../models/actor.js';
import { isText, toCents } from './validation.js';

/** An error with an HTTP status and an optional machine-readable code; the error handler sends it. */
export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (message, details) => new ApiError(400, message, 'VALIDATION_ERROR', details);
export const notFound = (message) => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message, code = 'CONFLICT', details) => new ApiError(409, message, code, details);
export const forbidden = (message = 'You don’t have permission to do that') => new ApiError(403, message, 'FORBIDDEN');

/** Wraps an async route handler so thrown errors reach the error handler. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Runs `work(session)` in a MongoDB transaction, retrying on transient write conflicts (e.g. two
 * people selling the same unit at once: the loser retries, then sees the unit is sold).
 */
export async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

// ---- Input parsing (throws badRequest with a clear message) ----

export function money(value, label, { required = true, allowZero = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required`);
    return null;
  }
  const cents = toCents(typeof value === 'string' ? Number(value) : value);
  if (Number.isNaN(cents) || (!allowZero && cents === 0)) {
    throw badRequest(`${label} must be ${allowZero ? 'zero or more' : 'more than zero'}, with at most 2 decimals`);
  }
  return cents;
}

export function text(value, label, { required = false, max = 120 } = {}) {
  if (value === undefined || value === null) value = '';
  if (!isText(value, { required, max })) throw badRequest(required && !String(value).trim() ? `${label} is required` : `${label} must be at most ${max} characters`);
  return value.trim();
}

export function oneOf(value, allowed, label, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) throw badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  return value;
}

export const paymentMethod = (value, fallback = 'CASH') => oneOf(value, PAYMENT_METHODS, 'Payment method', fallback);

export function objectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw badRequest(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(String(value));
}

export function wholeNumber(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} must be a whole number between ${min} and ${max}`);
  return n;
}

/** Converts a list of documents to CSV (RFC 4180 quoting). */
export function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Prevent spreadsheet formula injection from customer-entered text.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.map(c => cell(c.header)).join(','), ...rows.map(r => columns.map(c => cell(c.value(r))).join(','))].join('\r\n');
}
