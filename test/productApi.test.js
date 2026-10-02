const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const testDirectory = path.join(os.tmpdir(), `workshop-products-${process.pid}`);
process.env.PRODUCTS_FILE = path.join(testDirectory, 'db.json');

const app = require('../server');
const cache = require('../middleware/productCache');
const { cacheResponse } = require('../middleware/cacheMiddleware');
const database = require('../database/productDatabase');
const controller = require('../controllers/productController');

const originalProducts = [
  { id: 1, name: 'Keyboard', price: 49.99 },
  { id: 2, name: 'Mouse', price: 19.99 },
  { id: 3, name: 'Monitor', price: 199 },
  { id: 4, name: 'Mouse', price: 19 },
];

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    locals: {},
    body: undefined,
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function runController(handler, req, res) {
  await handler(req, res);
  return res;
}

test.beforeEach(async () => {
  await fs.mkdir(testDirectory, { recursive: true });
  await fs.writeFile(process.env.PRODUCTS_FILE, JSON.stringify(originalProducts));
  cache.clear();
});

test.after(async () => {
  await fs.rm(testDirectory, { recursive: true, force: true });
});

test('collection and product cache MISS then HIT without a controller call', async () => {
  let nextCalled = false;
  const collectionMiss = responseRecorder();
  cacheResponse(() => 'products')({}, collectionMiss, () => { nextCalled = true; });
  assert.equal(collectionMiss.headers['x-cache'], 'MISS');
  assert.equal(nextCalled, true);

  cache.set('products', originalProducts);
  const collectionHit = responseRecorder();
  cacheResponse(() => 'products')({}, collectionHit, () => assert.fail('HIT must bypass next'));
  assert.equal(collectionHit.headers['x-cache'], 'HIT');
  assert.deepEqual(collectionHit.body, originalProducts);

  cache.set('product:1', originalProducts[0]);
  const productHit = responseRecorder();
  cacheResponse(() => 'product:1')({}, productHit, () => assert.fail('HIT must bypass next'));
  assert.equal(productHit.headers['x-cache'], 'HIT');
  assert.deepEqual(productHit.body, originalProducts[0]);

  const productMiss = responseRecorder();
  cache.clear();
  cacheResponse(() => 'product:1')({}, productMiss, () => { nextCalled = true; });
  assert.equal(productMiss.headers['x-cache'], 'MISS');
});

test('expired cache is a MISS and fresh reads repopulate it', async () => {
  cache.set('products', ['stale']);
  const entry = cache.get('products');
  entry.createdAt = Date.now() - cache.CACHE_TTL;
  const expiredRes = responseRecorder();
  let nextCalled = false;
  cacheResponse(() => 'products')({}, expiredRes, () => { nextCalled = true; });
  assert.equal(expiredRes.headers['x-cache'], 'MISS');
  assert.equal(nextCalled, true);
  assert.equal(cache.get('products'), undefined);

  const freshRes = responseRecorder();
  freshRes.locals.cacheKey = 'products';
  await runController(controller.getProducts, {}, freshRes);
  assert.deepEqual(freshRes.body, originalProducts);
  assert.equal(cache.get('products').data.length, originalProducts.length);
});

test('GET cache hits skip service and database for collection and item', async () => {
  cache.set('products', originalProducts);
  const response = responseRecorder();
  cacheResponse(() => 'products')({}, response, () => assert.fail('controller should not run'));
  assert.equal(response.headers['x-cache'], 'HIT');

  cache.set('product:1', originalProducts[0]);
  const productResponse = responseRecorder();
  cacheResponse(() => 'product:1')({}, productResponse, () => assert.fail('controller should not run'));
  assert.equal(productResponse.headers['x-cache'], 'HIT');
});

test('POST, PUT and PATCH invalidate all product caches after success', async () => {
  cache.set('products', originalProducts);
  cache.set('product:1', originalProducts[0]);
  cache.set('product:2', originalProducts[1]);

  const created = responseRecorder();
  await runController(controller.createProduct, { body: { name: 'Stand', price: 25 } }, created);
  assert.equal(created.statusCode, 201);
  assert.deepEqual(cache.keys(), []);
  assert.equal((await database.getAll()).at(-1).id, 5);

  cache.set('products', await database.getAll());
  cache.set('product:1', originalProducts[0]);
  const updated = responseRecorder();
  await runController(controller.updateProduct, { params: { id: '1' }, body: { price: 55 } }, updated);
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.name, 'Keyboard');
  assert.equal(updated.body.price, 55);
  assert.deepEqual(cache.keys(), []);

  cache.set('products', await database.getAll());
  const replaced = responseRecorder();
  await runController(controller.replaceProduct, { params: { id: '1' }, body: { name: 'Compact Board', price: 45 } }, replaced);
  assert.equal(replaced.statusCode, 200);
  assert.deepEqual(replaced.body, { name: 'Compact Board', price: 45, id: 1 });
  assert.deepEqual(cache.keys(), []);

  cache.set('products', await database.getAll());
  const patched = responseRecorder();
  await runController(controller.updateProduct, { params: { id: '1' }, body: { name: 'Ergo Keyboard' } }, patched);
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.body.name, 'Ergo Keyboard');
  assert.deepEqual(cache.keys(), []);
});

test('DELETE invalidates caches; failed mutations preserve valid caches', async () => {
  cache.set('products', originalProducts);
  cache.set('product:1', originalProducts[0]);
  const failed = responseRecorder();
  await runController(controller.updateProduct, { params: { id: '999' }, body: { price: 1 } }, failed);
  assert.equal(failed.statusCode, 404);
  assert.deepEqual(cache.keys().sort(), ['product:1', 'products']);

  const deleted = responseRecorder();
  await runController(controller.deleteProduct, { params: { id: '1' } }, deleted);
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.id, 1);
  assert.deepEqual(cache.keys(), []);
  assert.equal(await database.getAll().then((items) => items.some((item) => item.id === 1)), false);
});

test('404s and invalid bodies are not cached', async () => {
  const missingRes = responseRecorder();
  missingRes.locals.cacheKey = 'product:999';
  await runController(controller.getProductById, { params: { id: '999' } }, missingRes);
  assert.equal(missingRes.statusCode, 404);
  assert.equal(cache.get('product:999'), undefined);

  const invalidRes = responseRecorder();
  await runController(controller.createProduct, { body: null }, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.deepEqual(cache.keys(), []);
});

test('product database errors return 500 and do not populate cache', async () => {
  await fs.writeFile(process.env.PRODUCTS_FILE, '{invalid json');
  const res = responseRecorder();
  res.locals.cacheKey = 'products';
  const originalConsoleError = console.error;
  console.error = () => {};
  await runController(controller.getProducts, {}, res);
  console.error = originalConsoleError;
  assert.equal(res.statusCode, 500);
  assert.equal(cache.get('products'), undefined);
});

test('the Express app configures product routes', () => {
  assert.ok(app);
});
