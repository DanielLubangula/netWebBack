const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const upload = require('../middlewares/upload');
// const { protect, authorize } = require('../middleware/auth');

// Routes publiques
router.get('/', newsController.getNews);
router.get('/featured', newsController.getFeaturedNews);
router.get('/:id', newsController.getSingleNews);

// Routes protégées (admin)
router.post('/', upload.single('image'), newsController.createNews);
router.put('/:id', upload.single('image'), newsController.updateNews);
router.delete('/:id',  newsController.deleteNews);

module.exports = router;