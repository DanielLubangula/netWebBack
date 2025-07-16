const express = require('express');
const passport = require('passport');
const router = express.Router();

// 1. Route pour déclencher l'authentification Google
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account' // Pour forcer la sélection du compte Google
}));

// 2. Route de callback Google
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
    session: false // car on utilise JWT ou un frontend non sessionné
  }),
  (req, res) => {
    // ✅ Une fois connecté avec succès, on peut générer un JWT et rediriger
    const jwt = require('jsonwebtoken');

    // On enrichit le token avec l'info isNewUser
    const token = jwt.sign(
      { id: req.user._id, email: req.user.email, isNewUser: req.user.isNewUser },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // On prépare l'objet user à renvoyer (sans le mot de passe)
    const { password, ...userWithoutPassword } = req.user;

    // Redirection vers le frontend avec le token et l'info utilisateur dans l'URL
    // (on encode l'objet user en base64 pour éviter les problèmes d'URL)
    const userEncoded = Buffer.from(JSON.stringify(userWithoutPassword)).toString('base64');
    res.redirect(`${process.env.FRONTEND_URL}/auth?token=${token}&user=${userEncoded}`);
  }
);

module.exports = router;
