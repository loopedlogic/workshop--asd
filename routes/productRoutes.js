const express = require('express');
const productController = require('../controllers/productController');
const { cacheResponse } = require('../middleware/cacheMiddleware');

const router = express.Router();

router.get('/', cacheResponse(() => 'products'), productController.getProducts);
router.get('/:id', cacheResponse((req) => `product:${req.params.id}`), productController.getProductById);

module.exports = router;
