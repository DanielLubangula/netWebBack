const express = require('express');
const Match = require('../models/Match'); // Assurez-vous que le modèle Match est correctement configuré
const router = express.Router();

// Vérifier si un match existe et récupérer son état
router.get('/:roomId', async (req, res) => {
  const { roomId } = req.params;

  try {

    // console.log('Récupération du match pour la roomId : ', roomId);
    const match = await Match.findOne({ roomId: roomId }) 
    .populate('players.userId');

    // console.log('match : ', match);
    if (!match) {
      return res.status(404).json({ message: 'Match introuvable' });
    }
 
    res.status(200).json(match);
  } catch (error) {
    console.error('Erreur lors de la récupération du match:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;