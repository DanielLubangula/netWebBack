const PublicMessage = require('../models/PublicMessage');
const User = require('../models/User');

// Récupérer tous les messages publics
exports.getPublicMessages = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const messages = await PublicMessage.find({ isDeleted: false })
            .populate('userId', 'username profilePicture')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        console.log("messages : ", messages)
        // Formater les messages avec les URLs complètes des images de profil
        const formattedMessages = messages.map(message => ({
            _id: message._id,
            text: message.text,
            username: message.username,
            profilePicture: message.profilePicture.startsWith('http') 
                ? message.profilePicture 
                : `${process.env.BACKEND_URL}${message.profilePicture}`,
            replyTo: message.replyTo,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
        }));

        const total = await PublicMessage.countDocuments({ isDeleted: false });

        res.json({
            messages: formattedMessages.reverse(), // Inverser pour avoir l'ordre chronologique
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalMessages: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des messages:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Envoyer un nouveau message
exports.sendPublicMessage = async (req, res) => {
    try {
        const { text, replyTo } = req.body;
        const userId = req.user.id;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ message: 'Le message ne peut pas être vide' });
        }

        if (text.length > 500) {
            return res.status(400).json({ message: 'Le message ne peut pas dépasser 500 caractères' });
        }

        // Récupérer les informations de l'utilisateur
        const user = await User.findById(userId).select('username profilePicture');
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        let replyData = null;
        if (replyTo && replyTo.messageId) {
            const originalMessage = await PublicMessage.findById(replyTo.messageId);
            if (originalMessage && !originalMessage.isDeleted) {
                replyData = {
                    messageId: originalMessage._id,
                    username: originalMessage.username,
                    text: originalMessage.text
                };
            }
        }

        
        const newMessage = new PublicMessage({
            userId,
            username: user.username,
            profilePicture: user.profilePicture,
            text: text.trim(),
            replyTo: replyData
        });
        console.log('newMessage : ', newMessage)

        await newMessage.save();

        // Récupérer le message avec les données complètes
        const savedMessage = await PublicMessage.findById(newMessage._id)
            .populate('userId', 'username profilePicture')
            .lean();

        const formattedMessage = {
            _id: savedMessage._id,
            text: savedMessage.text,
            username: savedMessage.username,
            profilePicture: savedMessage.profilePicture.startsWith('http') 
                ? savedMessage.profilePicture 
                : `${process.env.BACKEND_URL}${savedMessage.profilePicture}`,
            replyTo: savedMessage.replyTo,
            createdAt: savedMessage.createdAt,
            updatedAt: savedMessage.updatedAt
        };

        res.status(201).json({
            message: 'Message envoyé avec succès',
            data: formattedMessage
        });
    } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Supprimer un message (seulement par l'auteur)
exports.deletePublicMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await PublicMessage.findById(messageId);
        
        if (!message) {
            return res.status(404).json({ message: 'Message non trouvé' });
        }

        if (message.userId.toString() !== userId) {
            return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer ce message' });
        }

        message.isDeleted = true;
        await message.save();

        res.json({ message: 'Message supprimé avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression du message:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

// Récupérer un message spécifique (pour les réponses)
exports.getPublicMessage = async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await PublicMessage.findById(messageId)
            .populate('userId', 'username profilePicture')
            .lean();

        if (!message || message.isDeleted) {
            return res.status(404).json({ message: 'Message non trouvé' });
        }

        const formattedMessage = {
            _id: message._id,
            text: message.text,
            username: message.username,
            profilePicture: message.profilePicture.startsWith('http') 
                ? message.profilePicture 
                : `${process.env.BACKEND_URL}${message.profilePicture}`,
            replyTo: message.replyTo,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
        };

        res.json({ data: formattedMessage });
    } catch (error) {
        console.error('Erreur lors de la récupération du message:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
}; 