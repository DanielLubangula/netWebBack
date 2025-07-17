const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const  ensureAuthenticated  = require('../middlewares/authMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
// Toutes les routes nécessitent l'authentification
router.use(ensureAuthenticated);

// Récupérer toutes les notifications de l'utilisateur connecté
router.get('/', notificationController.getUserNotifications);

// Marquer une notification comme lue
router.patch('/:id/read', notificationController.markAsRead);

// Supprimer une notification
router.delete('/:id', notificationController.deleteNotification);

// Créer une notification (pour test ou usage admin)
router.post('/', notificationController.createNotification);
router.post('/admin/broadcast', notificationController.broadcastNotification);

module.exports = router; 