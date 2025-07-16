const express = require('express');
const router = express.Router();
const userSettingsController = require('../controllers/userSettingsController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/settings', authMiddleware, userSettingsController.getUserSettings);
router.put('/settings', authMiddleware, userSettingsController.updateUserSettings);

router.get('/profile', authMiddleware, userSettingsController.getUserProfile);
router.put('/profile', authMiddleware, userSettingsController.updateUserProfile);

module.exports = router; 

