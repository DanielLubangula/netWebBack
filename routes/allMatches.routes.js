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

module.exports = router;
