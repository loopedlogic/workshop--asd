const { createCache } = require('express-cache-toolkit');

const ttlMs = process.env.PRODUCT_CACHE_TTL_MS === undefined
  ? 60_000
  : Number(process.env.PRODUCT_CACHE_TTL_MS);
const cache = createCache({ ttlMs, maxEntries: 500 });

function cacheResponse(keyGenerator) {
  return cache.middleware({ keyGenerator, tags: ['products'] });
}

function invalidateProducts() {
  return cache.invalidateTag('products');
}

module.exports = { cacheResponse, invalidateProducts, cache };
