const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');

const testDirectory = path.join(os.tmpdir(), `workshop-products-${process.pid}`);
process.env.PRODUCTS_FILE = path.join(testDirectory, 'db.json');
process.env.PRODUCT_CACHE_TTL_MS = '100';
process.env.PRODUCT_READ_DELAY_MS = '0';

const app = require('../server');
const { cache } = require('../middleware/cacheMiddleware');

const originalProducts = [
  { id: 1, name: 'Keyboard', price: 49.99 },
  { id: 2, name: 'Mouse', price: 19.99 },
  { id: 3, name: 'Monitor', price: 199 },
  { id: 4, name: 'Mouse', price: 19 },
];

async function withServer(callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await callback(baseUrl);
  } finally {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections?.();
    await closed;
  }
}

async function request(baseUrl, route, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    cache: response.headers.get('x-cache'),
    body: contentType.includes('json') && text ? JSON.parse(text) : text,
  };
}

test.beforeEach(async () => {
  await fs.mkdir(testDirectory, { recursive: true });
  await fs.writeFile(process.env.PRODUCTS_FILE, JSON.stringify(originalProducts));
  cache.clear();
});

test.after(async () => {
  await fs.rm(testDirectory, { recursive: true, force: true });
});

test('GET /products and GET /products/:id return MISS then HIT', async () => {
  await withServer(async (baseUrl) => {
    const firstList = await request(baseUrl, '/products');
    const cachedList = await request(baseUrl, '/products');
    assert.equal(firstList.status, 200);
    assert.equal(firstList.cache, 'MISS');
    assert.deepEqual(firstList.body, originalProducts);
    assert.equal(cachedList.cache, 'HIT');
    assert.deepEqual(cachedList.body, originalProducts);

    const firstProduct = await request(baseUrl, '/products/1');
    const cachedProduct = await request(baseUrl, '/products/1');
    assert.equal(firstProduct.cache, 'MISS');
    assert.deepEqual(firstProduct.body, originalProducts[0]);
    assert.equal(cachedProduct.cache, 'HIT');
    assert.deepEqual(cachedProduct.body, originalProducts[0]);
  });
});

test('cached product collections expire and are fetched again', async () => {
  await withServer(async (baseUrl) => {
    const first = await request(baseUrl, '/products');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const expired = await request(baseUrl, '/products');
    assert.equal(first.cache, 'MISS');
    assert.equal(expired.cache, 'MISS');
    assert.deepEqual(expired.body, originalProducts);
  });
});

test('POST, PUT, PATCH, and DELETE invalidate list and item responses', async () => {
  await withServer(async (baseUrl) => {
    await request(baseUrl, '/products');
    await request(baseUrl, '/products/1');

    const created = await request(baseUrl, '/products', {
      method: 'POST',
      body: { name: 'Stand', price: 25 },
    });
    assert.equal(created.status, 201);
    assert.equal((await request(baseUrl, '/products')).cache, 'MISS');
    assert.equal((await request(baseUrl, '/products/1')).cache, 'MISS');

    const replaced = await request(baseUrl, '/products/1', {
      method: 'PUT',
      body: { name: 'Compact Board', price: 45 },
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(replaced.body, { name: 'Compact Board', price: 45, id: 1 });
    assert.equal((await request(baseUrl, '/products/1')).cache, 'MISS');

    await request(baseUrl, '/products');
    await request(baseUrl, '/products/1');
    const patched = await request(baseUrl, '/products/1', {
      method: 'PATCH',
      body: { name: 'Ergo Keyboard' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.name, 'Ergo Keyboard');
    assert.equal((await request(baseUrl, '/products')).cache, 'MISS');
    assert.equal((await request(baseUrl, '/products/1')).cache, 'MISS');

    await request(baseUrl, '/products');
    await request(baseUrl, '/products/1');
    const deleted = await request(baseUrl, '/products/1', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.id, 1);
    assert.equal((await request(baseUrl, '/products')).cache, 'MISS');
    const missing = await request(baseUrl, '/products/1');
    assert.equal(missing.status, 404);
    assert.equal(missing.cache, 'BYPASS');
  });
});

test('failed mutations preserve valid caches and missing responses are not cached', async () => {
  await withServer(async (baseUrl) => {
    await request(baseUrl, '/products');
    const failedUpdate = await request(baseUrl, '/products/999', {
      method: 'PATCH',
      body: { price: 1 },
    });
    assert.equal(failedUpdate.status, 404);
    assert.equal((await request(baseUrl, '/products')).cache, 'HIT');

    const invalidCreate = await request(baseUrl, '/products', { method: 'POST', body: [] });
    assert.equal(invalidCreate.status, 400);
    assert.equal((await request(baseUrl, '/products')).cache, 'HIT');

    const firstMissing = await request(baseUrl, '/products/999');
    const secondMissing = await request(baseUrl, '/products/999');
    assert.equal(firstMissing.status, 404);
    assert.equal(firstMissing.cache, 'BYPASS');
    assert.equal(secondMissing.cache, 'BYPASS');
  });
});

test('database errors become 500 responses and are not cached', async () => {
  await withServer(async (baseUrl) => {
    await fs.writeFile(process.env.PRODUCTS_FILE, '{invalid json');
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const first = await request(baseUrl, '/products');
      const second = await request(baseUrl, '/products');
      assert.equal(first.status, 500);
      assert.equal(first.cache, 'BYPASS');
      assert.equal(second.cache, 'BYPASS');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
