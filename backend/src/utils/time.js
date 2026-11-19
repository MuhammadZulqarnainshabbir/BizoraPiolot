// Shop-timezone date helpers. Instants are stored in UTC; "today", report periods and installment
// due dates are calendar dates in the shop's IANA timezone (e.g. Asia/Karachi).

export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch { return false; }
}

/** Calendar date ("YYYY-MM-DD") of `date` in `tz`. */
export function dateInZone(tz, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Milliseconds `tz` is ahead of UTC at the instant `ms`. */
function zoneOffset(ms, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
}

/** The UTC instant of midnight at the start of calendar date `ymd` in `tz`. */
export function startOfDateInZone(ymd, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let instant = guess - zoneOffset(guess, tz);
  const corrected = guess - zoneOffset(instant, tz); // handles a DST change near midnight
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

const parse = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return { y, m, d }; };
const format = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function addDays(ymd, days) {
  const { y, m, d } = parse(ymd);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Adds months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ymd, months) {
  const { y, m, d } = parse(ymd);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return format(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
}

export const isYmd = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && (() => {
  const { y, m, d } = parse(value); const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
})();

/** Start instants of today, this week (Monday) and this month in the shop's timezone. */
export function periodStarts(tz, now = new Date()) {
  const today = dateInZone(tz, now);
  const { y, m, d } = parse(today);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const monday = addDays(today, -((weekday + 6) % 7));
  return {
    today,
    dayStart: startOfDateInZone(today, tz),
    weekStart: startOfDateInZone(monday, tz),
    monthStart: startOfDateInZone(format(y, m, 1), tz)
  };
}
