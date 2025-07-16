const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
// const { protect, isAdmin } = require('../middlewares/authMiddleware');

// Dashboard
router.get('/dashboard', /*protect, isAdmin,*/ adminController.getDashboardStats);

// Users
router.get('/users', /*protect, isAdmin,*/ adminController.getAllUsers);
router.put('/users/:id', /*protect, isAdmin,*/ adminController.updateUser);
router.delete('/users/:id', /*protect, isAdmin,*/ adminController.deleteUser);

// Themes
router.get('/themes', /*protect, isAdmin,*/ adminController.getThemes);
router.post('/themes', /*protect, isAdmin,*/ adminController.createTheme);
router.put('/themes', /*protect, isAdmin,*/ adminController.updateTheme);
router.delete('/themes/:theme', /*protect, isAdmin,*/ adminController.deleteTheme);

// Global settings
router.get('/settings', /*protect, isAdmin,*/ adminController.getSettings);
router.put('/settings', /*protect, isAdmin,*/ adminController.updateSettings);

module.exports = router; 