const productDatabase = require('../database/productDatabase');

const READ_DELAY_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getProducts() {
  await delay(READ_DELAY_MS);
  return productDatabase.getAll();
}

async function getProductById(id) {
  await delay(READ_DELAY_MS);
  const numericId = Number(id);
  const products = await productDatabase.getAll();
  return products.find((product) => product.id === numericId) || null;
}

module.exports = { getProducts, getProductById };
