const express = require('express');
const { getOnlineUsers } = require('../socket');
const User = require('../models/User');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const onlineUsersMap = getOnlineUsers();
    const userIds = Array.from(onlineUsersMap.keys());

    // Récupérer les infos utilisateurs depuis la base
    const users = await User.find({ _id: { $in: userIds } }).lean();

    // Ajouter le socketId à chaque utilisateur
    const usersWithSocket = users.map(user => ({
      ...user,
      socketId: onlineUsersMap.get(user._id.toString())
    }));

    res.json(usersWithSocket);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;