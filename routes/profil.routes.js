const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Match = require('../models/Match');
const Notification = require('../models/Notification'); // Added Notification model

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
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Helper pour agréger les stats par joueur
    async function getPeriodStats(startDate) {
      // On ne prend que les matchs terminés (completed ou abandoned) dans la période
      const matches = await Match.find({
        status: { $in: ['completed', 'abandoned'] },
        completedAt: { $gte: startDate }
      });
      const userStats = {};
      matches.forEach(match => {
        // Gagnant
        if (match.winner) {
          const winnerId = match.winner.toString();
          if (!userStats[winnerId]) userStats[winnerId] = { wins: 0, games: 0 };
          userStats[winnerId].wins += 1;
        }
        // Tous les joueurs ayant joué
        match.players.forEach(player => {
          const userId = player.userId.toString();
          if (!userStats[userId]) userStats[userId] = { wins: 0, games: 0 };
          userStats[userId].games += 1;
        });
      });
      // On ne retient que les joueurs ayant au moins 1 partie dans la période
      const userIds = Object.keys(userStats);
      // On récupère les infos actuelles des joueurs
      const users = await User.find({ _id: { $in: userIds } }).select('-password');
      // On enrichit avec les stats de la période
      return users.map(user => ({
        _id: user._id,
        username: user.username,
        level: user.level,
        experience: user.experience,
        totalScore: user.totalScore,
        profilePicture: user.profilePicture ? `${user.profilePicture}` : null,
        wins: userStats[user._id.toString()].wins,
        games: userStats[user._id.toString()].games
      }));
    }

    // Global = tous les joueurs
    const allUsers = await User.find().select('-password');
    const sortUsers = (users) =>
      users
        .sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          if (b.experience !== a.experience) return b.experience - a.experience;
          return b.totalScore - a.totalScore;
        })
        .slice(0, 10)
        .map((user) => ({
          _id: user._id,
          username: user.username,
          level: user.level,
          experience: user.experience,
          totalScore: user.totalScore,
          profilePicture: user.profilePicture ? `${user.profilePicture}` : null,
        }));

    // Joueurs actifs sur la période
    const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
      getPeriodStats(startOfDay),
      getPeriodStats(startOfWeek),
      getPeriodStats(startOfMonth)
    ]);

    const leaderboard = {
      global: sortUsers(allUsers), 
      daily: sortUsers(dailyStats),
      weekly: sortUsers(weeklyStats),
      monthly: sortUsers(monthlyStats),
    };

    res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Erreur lors de la récupération du classement :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Route pour récompenser un joueur solo
router.post('/solo-reward', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { score, totalQuestions } = req.body;

    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Calculer la récompense (1 XP + 10 points)
    const xpReward = 1;
    const pointsReward = 10;
    
    // Mettre à jour l'utilisateur
    let newXP = (user.experience ?? 50) + xpReward;
    let newLevel = user.level;
    
    // Vérifier si level up
    if (newXP >= 100) {
      newLevel += 1;
      newXP = 50; // XP par défaut après up
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        experience: newXP,
        level: newLevel
      },
      $inc: {
        totalScore: pointsReward,
        gamesPlayed: 1
      }
    });

    // Créer une notification
    await Notification.create({
      userId: userId,
      type: 'success',
      title: 'Récompense Quiz Solo',
      message: `Félicitations ! Vous avez gagné ${xpReward} XP et ${pointsReward} points pour avoir terminé votre quiz solo.`,
      data: {
        xpGained: xpReward,
        pointsGained: pointsReward,
        score: score,
        totalQuestions: totalQuestions
      }
    });

    res.status(200).json({
      message: 'Récompense attribuée avec succès',
      reward: {
        xp: xpReward,
        points: pointsReward,
        newXP: newXP,
        newLevel: newLevel
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'attribution de la récompense solo:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;