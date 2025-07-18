const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Match = require('../models/Match');

const authMiddleware = require('../middlewares/authMiddleware'); // Importer le middleware

// Configuration de multer pour les uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/profil')); // Dossier de destination
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Nom unique pour chaque fichier
    }
});
const upload = multer({ storage });

// Route pour mettre à jour la photo de profil
router.post('/image', authMiddleware, upload.single('profileImage'), async (req, res) => {
    try {
        const userId = req.user.id; // Récupérer l'ID utilisateur depuis le token
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        // Mettre à jour la photo de profil
        user.profilePicture = `/uploads/profil/${req.file.filename}`;
        await user.save();

    res.status(200).json({ message: 'Photo de profil mise à jour avec succès', imageUrl: process.env.BACKEND_URL + user.profilePicture });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Route pour consulter le profil d’un utilisateur par ID
router.get('/public/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        // console.log("Récupération du profil public pour l'utilisateur ID:", userId);
        if (!userId || userId === 'null') {

            console.error('ID utilisateur manquant');
            return res.status(400).json({ message: 'ID utilisateur manquant' });
        }
        // console.log('id présent : ', userId);
        const user = await User.findById(userId).select('-password'); // Exclure le mot de passe

        if (!user) { 
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        res.status(200).json({
            _id: user._id,
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture ? `${user.profilePicture}` : null,
            level: user.level,
            experience: user.experience,
            nextLevelExp: user.nextLevelExp,
            gamesPlayed: user.gamesPlayed,
            winRate: user.winRate,
            currentStreak: user.currentStreak,
            totalScore: user.totalScore,
            rank: user.rank,
            bestStreak: user.bestStreak,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Erreur lors de la récupération du profil public :', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Route pour récupérer tous les matchs d'un utilisateur
router.get('/matches/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        if (!userId || userId === 'null') {
            return res.status(400).json({ message: 'ID utilisateur manquant ou invalide' });
        }

        const matches = await Match.find({ 'players.userId': userId })
            .sort({ createdAt: -1 }) // tri du plus récent au plus ancien

        res.status(200).json(matches);
    } catch (error) {
        console.error('Erreur lors de la récupération des matchs de l\'utilisateur :', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const now = new Date();

    const dateRanges = {
      daily: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), // hier
      weekly: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7),
      monthly: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
    };

    const [allUsers, dailyUsers, weeklyUsers, monthlyUsers] = await Promise.all([
      User.find().select('-password'),
      User.find({ updatedAt: { $gte: dateRanges.daily } }).select('-password'),
      User.find({ updatedAt: { $gte: dateRanges.weekly } }).select('-password'),
      User.find({ updatedAt: { $gte: dateRanges.monthly } }).select('-password'),
    ]);

    const sortUsers = (users) =>
      users
        .sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          if (b.experience !== a.experience) return b.experience - a.experience;
          return b.totalScore - a.totalScore;
        })
        .slice(0, 10) // top 10
        .map((user) => ({
          _id: user._id,
          username: user.username,
          level: user.level,
          experience: user.experience,
          totalScore: user.totalScore,
          profilePicture: user.profilePicture
            ? `${user.profilePicture}`
            : null,
        }));

    const leaderboard = {
      global: sortUsers(allUsers),
      daily: sortUsers(dailyUsers),
      weekly: sortUsers(weeklyUsers),
      monthly: sortUsers(monthlyUsers),
    };

    res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Erreur lors de la récupération du classement :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});




module.exports = router;