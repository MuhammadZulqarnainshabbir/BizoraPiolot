const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;
// Case-insensitive ordering for text columns; must match the collation on the
// corresponding indexes in the models so MongoDB can use them for sorting.
export const TEXT_COLLATION = { locale: 'en', strength: 2 };

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function positiveInt(value, fallback, max) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

/** Reads page/limit/search/sort/order from the query string, falling back to safe defaults. */
function parseListQuery(query, { sortFields, textSortFields = [], searchFields, defaultSort = 'updatedAt' }) {
  const page = positiveInt(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = positiveInt(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  const sort = sortFields.includes(query.sort) ? query.sort : defaultSort;
  const order = query.order === 'asc' ? 1 : -1;
  const searchFilter = search
    ? { $or: searchFields.map(field => ({ [field]: { $regex: escapeRegex(search), $options: 'i' } })) }
    : {};
  return {
    page,
    limit,
    searchFilter,
    // _id breaks ties so records never repeat or vanish between pages.
    sortSpec: { [sort]: order, _id: order },
    collation: textSortFields.includes(sort) ? TEXT_COLLATION : undefined
  };
}

/** One page of a shop's records plus pagination metadata. */
export async function listPage(Model, shopId, query, listConfig, extraFilter = {}) {
  const { page, limit, searchFilter, sortSpec, collation } = parseListQuery(query, listConfig);
  const filter = { shopId, ...extraFilter, ...searchFilter };
  let find = Model.find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit).lean();
  if (collation) find = find.collation(collation);
  const [records, total] = await Promise.all([find, Model.countDocuments(filter)]);
  return { records, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
