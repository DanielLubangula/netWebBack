const express = require('express');
const MatchComment = require('../models/MatchComment');
const Match = require('../models/Match');
const Notification = require('../models/Notification');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();
const User = require('../models/User')
// Récupérer tous les commentaires d'un match
router.get('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    console.log("machId : ", matchId)
    const comments = await MatchComment.find({matchId : matchId })
      .populate('author', 'username profilePicture')
      .sort({ createdAt: -1 });
    
    res.json(comments);
  } catch (error) {
    console.error('Error fetching match comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ajouter un commentaire à un match
router.post('/:matchId', authMiddleware, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { message } = req.body;
    const authorId = req.user.id;
    console.log("intérieur : ",{matchId, message, authorId})
    
    // Vérifier que le match existe en utilisant roomId au lieu de _id
    console.log("Recherche du match avec roomId:", matchId);
    const match = await Match.findOne({ roomId: matchId });
    console.log("Match trouvé:", match ? "Oui" : "Non");
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Vérifier que le match est terminé
    console.log("Statut du match:", match.status);
    if (match.status !== 'completed' && match.status !== 'abandoned') {
      return res.status(400).json({ error: 'Can only comment on completed matches' });
    }

    // Créer le commentaire
    console.log("Création du commentaire avec:", { matchId, author: authorId, message });
    const comment = new MatchComment({
      matchId,
      author: authorId,
      message
    });

    await comment.save();

    // Populate l'auteur pour la réponse
    await comment.populate('author', 'username profilePicture');

    // Envoyer des notifications aux joueurs du match
    const matchPlayers = match.players.map(player => player.userId.toString());
    const isAuthorInMatch = matchPlayers.includes(authorId);

    if (isAuthorInMatch) {
      // Si l'auteur fait partie du match, notifier l'autre joueur
      const otherPlayerId = matchPlayers.find(id => id !== authorId);
      if (otherPlayerId) {
        const info = await User.findById(req.user.id)
        console.log('*********** 2: ', info.username)
        await Notification.create({
          userId: otherPlayerId,
          type: 'match_comment',
          title: 'Nouveau commentaire sur votre match',
          message: `${info.username} a commenté votre match`,
          data: {
            matchId,
            commentId: comment._id,
            authorId
          }
        });
      }
    } else {
      // Si l'auteur ne fait pas partie du match, notifier les deux joueurs
      for (const playerId of matchPlayers) {
        await Notification.create({
          userId: playerId,
          type: 'match_comment',
          title: 'Nouveau commentaire sur votre match',
          message: `${req.user.username} a commenté votre match`,
          data: {
            matchId,
            commentId: comment._id,
            authorId
          }
        });
      }
    }

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating match comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Supprimer un commentaire (seulement l'auteur ou admin)
router.delete('/:commentId', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await MatchComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Vérifier que l'utilisateur est l'auteur du commentaire
    if (comment.author.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await MatchComment.findByIdAndDelete(commentId);
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting match comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 