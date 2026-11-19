import { PRODUCT_CATEGORIES } from '../config/productCategories.js';
import { assertWithinLimit } from '../middleware/entitlements.js';
import InventoryUnit from '../models/InventoryUnit.js';
import * as inventory from '../services/inventoryService.js';
import { handle } from '../utils/http.js';

export const listCategories = (_req, res) => res.json({ categories: PRODUCT_CATEGORIES });

export const addStock = handle(async (req, res) => {
  // Plan capacity: units already in the shop plus the ones being added.
  if (req.entitlements?.limits?.maxInventoryUnits != null) {
    const adding = Array.isArray(req.body?.serialNumbers) ? req.body.serialNumbers.length : 1;
    assertWithinLimit(req.entitlements, 'maxInventoryUnits', await InventoryUnit.countDocuments({ shopId: req.shop._id }), adding, 'Inventory capacity');
  }
  res.status(201).json(await inventory.addStock(req.actor, req.shop._id, req.body));
});
export const listProducts = handle(async (req, res) => res.json(await inventory.listProducts(req.actor, req.shop._id, req.query)));
export const getProduct = handle(async (req, res) => res.json(await inventory.getProduct(req.actor, req.shop._id, req.params.id)));
export const updateProduct = handle(async (req, res) => res.json(await inventory.updateProduct(req.actor, req.shop._id, req.params.id, req.body)));
export const stockSummary = handle(async (req, res) => res.json({ summary: await inventory.stockSummary(req.actor, req.shop._id) }));
export const listUnits = handle(async (req, res) => res.json(await inventory.listUnits(req.actor, req.shop, req.query)));
export const getUnit = handle(async (req, res) => res.json(await inventory.getUnit(req.actor, req.shop._id, req.params.unitId)));
export const findBySerial = handle(async (req, res) => res.json(await inventory.findBySerial(req.actor, req.shop._id, req.params.serial)));
export const updateUnit = handle(async (req, res) => res.json(await inventory.updateUnit(req.actor, req.shop._id, req.params.unitId, req.body)));
export const deleteUnit = handle(async (req, res) => { await inventory.deleteUnit(req.actor, req.shop._id, req.params.unitId, req.body); res.status(204).end(); });
