// Session lifetimes. Each session has two limits:
//  - idle:  signed out after this long without activity. Tokens live this long and are renewed
//           (POST .../refresh) while the user is active, so an idle session simply expires.
//  - max:   signed out this long after logging in, however active the user is.
// Override in .env, e.g. OWNER_IDLE_MINUTES=60. Decimals are allowed (0.5 = 30 seconds).
const positive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const SESSION_LIMITS = {
  owner: {
    idleSeconds: Math.round(positive(process.env.OWNER_IDLE_MINUTES, 30) * 60),
    maxSeconds: Math.round(positive(process.env.OWNER_MAX_HOURS, 12) * 3600)
  },
  employee: {
    // Shorter, because shop-counter devices are often shared.
    idleSeconds: Math.round(positive(process.env.EMPLOYEE_IDLE_MINUTES, 15) * 60),
    maxSeconds: Math.round(positive(process.env.EMPLOYEE_MAX_HOURS, 12) * 3600)
  }
};
