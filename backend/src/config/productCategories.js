// Product categories and sub-categories offered when adding products.
// Source: Subhan Electronics product list (subhanelectronics.pk homepage, 11 Nov 2026).
// This is the single source of truth: the frontend loads it from GET /api/v1/categories.
export const PRODUCT_CATEGORIES = Object.freeze([
  { name: 'Air Conditioners', subCategories: ['Air Curtain', 'Ceiling Cassette', 'Convertible (Floor & Ceiling)', 'Duct AC', 'Floor Standing Cabinet', 'Wall Mounted'] },
  { name: 'Air Purifiers', subCategories: ['Air Purifiers'] },
  { name: 'Best Air Coolers & Water Coolers', subCategories: ['Room Air Coolers'] },
  { name: 'Deep & Up Right Freezers', subCategories: ['Double Door Freezers', 'Single Door Freezers'] },
  { name: 'Electric Scooters', subCategories: ['Electric Scooters'] },
  { name: 'Geysers', subCategories: ['Electric Storage Geysers', 'Fast Electric Geysers', 'Instant Gas Geysers'] },
  { name: 'Heaters', subCategories: ['Electric Heaters', 'Fan Heaters', 'Oil Heaters'] },
  { name: 'Home Appliances', subCategories: ['Garment Steamer', 'Iron'] },
  { name: 'LED TV & Audio', subCategories: ['4K UHD TVs', 'Frame TVs', 'Mini LED TVs', 'Monitors', 'OLED TVs', 'QLED TVs', 'Smart LED TVs', 'Sound Bar & Audio'] },
  { name: 'Refrigerators', subCategories: ['Multi Door', 'Top Mount'] },
  { name: 'Solar Inverter', subCategories: ['Solar Inverter / UPS'] },
  { name: 'Washing Machines & Dryers', subCategories: ['Dryers', 'Front Load', 'Single Tub', 'Spinner', 'Top Load', 'Twin Tub'] },
  { name: 'Water Dispensers', subCategories: ['3 Taps'] }
].map(category => Object.freeze({ ...category, subCategories: Object.freeze([...category.subCategories]) })));

const byName = new Map(PRODUCT_CATEGORIES.map(category => [category.name, category]));

/** True when `subCategory` is one of `category`'s sub-categories in the list above. */
export function isKnownCategory(category, subCategory) {
  return Boolean(byName.get(category)?.subCategories.includes(subCategory));
}
