const entries = new Map();
const CACHE_TTL = 60 * 1000;

function get(key) {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt >= CACHE_TTL) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

function set(key, data) {
  entries.set(key, { data, createdAt: Date.now() });
}

function deleteKey(key) {
  return entries.delete(key);
}

function clear() {
  entries.clear();
}

function keys() {
  return [...entries.keys()];
}

module.exports = { get, set, deleteKey, clear, keys, CACHE_TTL };
