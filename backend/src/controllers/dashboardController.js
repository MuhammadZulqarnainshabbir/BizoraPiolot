import * as dashboard from '../services/dashboardService.js';
import * as inventory from '../services/inventoryService.js';
import * as sales from '../services/salesService.js';
import { handle } from '../utils/http.js';

export const partnerSummary = handle(async (req, res) => res.json({ summary: await dashboard.partnerSummary(req.actor, req.shop) }));
export const partnerInventory = handle(async (req, res) => res.json(await inventory.listUnits(req.actor, req.shop, req.query)));
export const partnerFullPrice = handle(async (req, res) => res.json({ stats: await dashboard.fullPriceDashboard(req.actor, req.shop) }));
export const partnerInstallment = handle(async (req, res) => res.json({ stats: await dashboard.installmentDashboard(req.actor, req.shop) }));
export const partnerEmployees = handle(async (req, res) => res.json({ items: await dashboard.employeePerformance(req.shop) }));

export const employeeSummary = handle(async (req, res) => res.json({ summary: await dashboard.employeeSummary(req.actor, req.shop) }));
export const employeeMySales = handle(async (req, res) => res.json(await sales.listMySales(req.actor, req.shop, req.query)));
