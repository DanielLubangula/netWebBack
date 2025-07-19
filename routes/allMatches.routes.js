const express = require('express');
const Match = require('../models/Match');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const matches = await Match.find();
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route pour récupérer les matchs terminés récents
router.get('/completed/recent', async (req, res) => {
    try {
        const matches = await Match.find({ 
            status: { $in: ['completed', 'abandoned'] } 
        })
        .populate('players.userId', 'username profilePicture')
        .sort({ completedAt: -1 })
        .limit(10); // Limiter à 10 matchs récents
        
        res.json(matches);
    } catch (error) {
        console.error('Error fetching completed matches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
