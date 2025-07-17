/**
 * @property {Number} level - Niveau du joueur, représentant son progression globale dans le jeu. Par défaut, il commence au niveau 1.
 * @property {Number} experience - Expérience actuelle accumulée par le joueur. Cette valeur augmente au fur et à mesure que le joueur joue et réussit des défis. Par défaut, elle est initialisée à 0.
 * @property {Number} nextLevelExp - Expérience nécessaire pour atteindre le prochain niveau. Par défaut, cette valeur est fixée à 1000.
 * @property {Number} gamesPlayed - Nombre total de parties jouées par le joueur. Ce champ permet de suivre l'activité du joueur. Par défaut, il est initialisé à 0.
 * @property {Number} winRate - Pourcentage de victoires du joueur, calculé en fonction du nombre de parties gagnées par rapport au nombre total de parties jouées. Par défaut, il est initialisé à 0.
 * @property {Number} currentStreak - Série actuelle de victoires consécutives du joueur. Ce champ est utile pour suivre les performances récentes du joueur. Par défaut, il est initialisé à 0.
 * @property {Number} bestStreak - Meilleure série de victoires consécutives jamais réalisée par le joueur. Ce champ permet de conserver un record personnel. Par défaut, il est initialisé à 0.
 * @property {Number} totalScore - Score total accumulé par le joueur au fil de ses parties. Ce champ reflète la performance globale du joueur. Par défaut, il est initialisé à 0.
 * @property {Object} rank - Classement du joueur dans différentes périodes de temps.
 * @property {Number} rank.daily - Classement quotidien du joueur, basé sur ses performances du jour. Par défaut, il est initialisé à 0.
 * @property {Number} rank.weekly - Classement hebdomadaire du joueur, basé sur ses performances de la semaine. Par défaut, il est initialisé à 0.
 * @property {Number} rank.monthly - Classement mensuel du joueur, basé sur ses performances du mois. Par défaut, il est initialisé à 0.
 */ 
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Notification = require('./Notification');


const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    googleId: { type: String, unique: true, sparse: true }, // Ajouté pour Google OAuth
    profilePicture: { type: String, default: '/uploads/profil/default_profil.webp' }, // Par défaut, un emoji ou une URL
    level: { type: Number, default: 1 }, // Niveau du joueur
    experience: { type: Number, default: 0 }, // Expérience actuelle
    nextLevelExp: { type: Number, default: 1000 }, // Expérience nécessaire pour le prochain niveau
    gamesPlayed: { type: Number, default: 0 }, // Nombre de parties jouées
    winRate: { type: Number, default: 0 }, // Pourcentage de victoires
    currentStreak: { type: Number, default: 0 }, // Série actuelle de victoires
    bestStreak: { type: Number, default: 0 }, // Meilleure série de victoires
    totalScore: { type: Number, default: 0 }, // Score total
    rank: {
        daily: { type: Number, default: 0 }, // Classement quotidien
        weekly: { type: Number, default: 0 }, // Classement hebdomadaire
        monthly: { type: Number, default: 0 } // Classement mensuel
    },
    settings: { type: Object, default: {} } // Paramètres utilisateur
}, { timestamps: true });

// Middleware pour hacher le mot de passe avant de sauvegarder
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        this.password = await bcrypt.hash(this.password, 10);
        next();
    } catch (error) {
        next(error);
    }
});

// Méthode pour comparer les mots de passe
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Méthode utilitaire pour créer une notification pour un utilisateur
// UserSchema.statics.notify = async function(userId, title, message, type = 'info') {
//   return Notification.create({ userId, title, message, type });
// };

module.exports = mongoose.model('User', UserSchema);