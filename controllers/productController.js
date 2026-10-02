const productService = require('../services/productService');
const cache = require('../middleware/productCache');

async function getProducts(req, res) {
  try {
    const products = await productService.getProducts();
    if (res.locals.cacheKey) cache.set(res.locals.cacheKey, products);
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}

async function getProductById(req, res) {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).send('Product not found');
    }
    if (res.locals.cacheKey) cache.set(res.locals.cacheKey, product);
    return res.json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
}

function validProductBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

async function createProduct(req, res) {
  if (!validProductBody(req.body)) return res.status(400).send('Invalid product');
  try {
    const product = await productService.createProduct(req.body);
    cache.invalidateProducts();
    return res.status(201).json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
}

async function updateProduct(req, res, { replace = false } = {}) {
  if (!validProductBody(req.body)) return res.status(400).send('Invalid product');
  try {
    const product = await productService.updateProduct(req.params.id, req.body, { replace });
    if (!product) return res.status(404).send('Product not found');
    cache.invalidateProducts();
    return res.json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
}

async function replaceProduct(req, res) {
  return updateProduct(req, res, { replace: true });
}

async function deleteProduct(req, res) {
  try {
    const product = await productService.deleteProduct(req.params.id);
    if (!product) return res.status(404).send('Product not found');
    cache.invalidateProducts();
    return res.json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, replaceProduct, deleteProduct };
