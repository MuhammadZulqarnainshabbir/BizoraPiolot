import Shop from '../models/Shop.js';
import { shopStatusError } from '../services/platform/shopStatus.js';

/**
 * Loads the signed-in user's shop (id + timezone) as req.shop. Use after `authenticate`.
 * A shop that the platform has suspended, deactivated or not yet approved gets 403 on every
 * shop endpoint; its records stay where they are.
 */
export async function loadShop(req, res, next) {
  try {
    const shop = await Shop.findById(req.shopId).select('timezone shopName status').lean();
    if (!shop) return res.status(401).json({ message: 'Shop account not found' });
    const blocked = await shopStatusError(shop);
    if (blocked) return res.status(403).json(blocked);
    req.shop = { _id: shop._id, timezone: shop.timezone || 'Asia/Karachi', shopName: shop.shopName };
    next();
  } catch (err) { next(err); }
}
