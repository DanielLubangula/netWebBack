const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

// Appliquer l'authentification à toutes les routes
router.use(authMiddleware);

// Récupérer tous les messages publics
router.get('/public', chatController.getPublicMessages);

// Envoyer un nouveau message
router.post('/public', chatController.sendPublicMessage);

// Supprimer un message (seulement par l'auteur)
router.delete('/public/:messageId', chatController.deletePublicMessage);

// Récupérer un message spécifique (pour les réponses)
router.get('/public/:messageId', chatController.getPublicMessage);

module.exports = router; 