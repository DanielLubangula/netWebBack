const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { username, email, password } = req.body;
    try {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email déjà utilisé' });
        }

        // Créer un nouvel utilisateur
        const newUser = new User({ username, email, password });
        await newUser.save();

        // Générer un token
        const token = jwt.sign({ id: newUser._id, role: "user" }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        
        // Renommer la variable password lors de la destructuration
        const { password: userPassword, ...userWithoutPassword } = newUser.toObject();
        
        const enrichedUser = {
            ...userWithoutPassword,
            profilePicture: userWithoutPassword.profilePicture ? `${process.env.BACKEND_URL}${userWithoutPassword.profilePicture}` : undefined
        };
        
        res.status(201).json({ 
            message: 'Utilisateur créé avec succès', 
            token, 
            user: enrichedUser 
        });
    } catch (error) {
        console.log('Erreur lors de la création de l\'utilisateur:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Email ou mot de passe incorrect' });
        }
        // Vérifier le mot de passe
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Email ou mot de passe incorrect' });
        }
        // Générer un token
        const token = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

        // Exclure le mot de passe de l'objet utilisateur
        const userWithoutPassword = { 
            ...user.toObject(), 
            password: undefined, 
            profilePicture: user.profilePicture ? `${process.env.BACKEND_URL}${user.profilePicture}` : undefined 
        };
        console.log('Utilisateur connecté:', userWithoutPassword);
        // Répondre avec le token et les informations de l'utilisateur
        res.status(200).json({ message: 'Connexion réussie', token, user: userWithoutPassword });
    } catch (error) {
        console.log('Erreur lors de la connexion:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};