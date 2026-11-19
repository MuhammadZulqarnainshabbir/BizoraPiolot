/**
 * Base URL of the Bizora Pilot API. It is relative to the app's own origin: during development
 * `ng serve` forwards /api to the API on port 3000 (proxy.conf.json), and in production nginx does
 * the same (nginx/default.conf.template). So the same build works wherever it is deployed.
 */
export const API_BASE = '/api/v1';

/** Employee-app endpoints live under this prefix and use the employee token. */
export const EMPLOYEE_API = `${API_BASE}/employee`;
