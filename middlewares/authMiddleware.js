const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]; // Récupérer le token depuis le header Authorization

    if (!token) {
        return res.status(401).json({ message: 'Accès non autorisé, aucun token fourni' });
    }

    try {
        // Vérifier et décoder le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Ajouter les informations du token à req.user
        next(); // Passer au middleware suivant
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Token invalide ou expiré' });
    }
};

module.exports = authMiddleware;