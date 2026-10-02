const productService = require('../services/productService');

async function getProducts(req, res) {
  try {
    const products = await productService.getProducts();
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
    return res.json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = { getProducts, getProductById };
