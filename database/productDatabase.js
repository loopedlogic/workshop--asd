const fs = require('node:fs/promises');
const path = require('node:path');
const temporaryFile = path.join(__dirname, '..', 'db.json.tmp');

const dataFile = process.env.PRODUCTS_FILE || path.join(__dirname, '..', 'db.json');

async function getAll() {
  const contents = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(contents);
}

async function writeAll(products) {
  await fs.writeFile(temporaryFile, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, dataFile);
}

async function create(product) {
  const products = await getAll();
  const nextId = products.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const { id: ignoredId, ...fields } = product;
  const newProduct = { ...fields, id: nextId };
  products.push(newProduct);
  await writeAll(products);
  return newProduct;
}

async function update(id, changes, { replace = false } = {}) {
  const products = await getAll();
  const numericId = Number(id);
  const index = products.findIndex((product) => product.id === numericId);
  if (index === -1) return null;
  products[index] = { ...(replace ? {} : products[index]), ...changes, id: numericId };
  await writeAll(products);
  return products[index];
}

async function remove(id) {
  const products = await getAll();
  const numericId = Number(id);
  const index = products.findIndex((product) => product.id === numericId);
  if (index === -1) return null;
  const [deletedProduct] = products.splice(index, 1);
  await writeAll(products);
  return deletedProduct;
}

module.exports = { getAll, create, update, remove };
