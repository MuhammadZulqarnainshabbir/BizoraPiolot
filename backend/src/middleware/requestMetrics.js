// Real, in-memory API metrics since the process started: request counts by status class and an
// hourly ring for the last 24 hours. No fabricated figures: when the process restarts, the
// counters restart and the dashboard says since when.

const HOURS = 24;
const startedAt = new Date();
const totals = { requests: 0, status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0, totalLatencyMs: 0 };
const hours = new Map(); // hourStart(ms) → { requests, status4xx, status5xx, latencyMs }

function bucketFor(now) {
  const hourStart = now - (now % 3_600_000);
  let bucket = hours.get(hourStart);
  if (!bucket) {
    bucket = { requests: 0, status4xx: 0, status5xx: 0, latencyMs: 0 };
    hours.set(hourStart, bucket);
    for (const key of hours.keys()) if (key < hourStart - (HOURS - 1) * 3_600_000) hours.delete(key);
  }
  return bucket;
}

export function requestMetrics(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const latency = Date.now() - start;
    const cls = Math.floor(res.statusCode / 100);
    totals.requests++;
    totals.totalLatencyMs += latency;
    if (cls === 2) totals.status2xx++; else if (cls === 3) totals.status3xx++; else if (cls === 4) totals.status4xx++; else if (cls >= 5) totals.status5xx++;
    const bucket = bucketFor(start);
    bucket.requests++;
    bucket.latencyMs += latency;
    if (cls === 4) bucket.status4xx++;
    if (cls >= 5) bucket.status5xx++;
  });
  next();
}

export function metricsSnapshot() {
  const now = Date.now();
  const hourStart = now - (now % 3_600_000);
  const series = [];
  for (let i = HOURS - 1; i >= 0; i--) {
    const key = hourStart - i * 3_600_000;
    const b = hours.get(key) ?? { requests: 0, status4xx: 0, status5xx: 0, latencyMs: 0 };
    series.push({ hour: new Date(key).toISOString(), requests: b.requests, status4xx: b.status4xx, status5xx: b.status5xx, avgLatencyMs: b.requests ? Math.round(b.latencyMs / b.requests) : 0 });
  }
  return {
    since: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    totals: { ...totals, avgLatencyMs: totals.requests ? Math.round(totals.totalLatencyMs / totals.requests) : 0, errorRate: totals.requests ? Number(((totals.status5xx) / totals.requests).toFixed(4)) : 0 },
    hourly: series
  };
}
