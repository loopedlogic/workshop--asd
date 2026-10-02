const cache = require('./productCache');

function cacheResponse(keyFromRequest) {
  return function productResponseCache(req, res, next) {
    const key = keyFromRequest(req);
    const entry = cache.get(key);

    if (entry) {
      res.set('X-Cache', 'HIT');
      return res.json(entry.data);
    }

    res.set('X-Cache', 'MISS');
    res.locals.cacheKey = key;
    return next();
  };
}

module.exports = { cacheResponse };
