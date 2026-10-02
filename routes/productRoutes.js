const express = require('express');
const productController = require('../controllers/productController');
const { cacheResponse } = require('../middleware/cacheMiddleware');

const router = express.Router();

router.get('/', cacheResponse(() => 'products'), productController.getProducts);
router.get('/:id', cacheResponse((req) => `product:${req.params.id}`), productController.getProductById);
router.post('/', productController.createProduct);
router.put('/:id', productController.replaceProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
