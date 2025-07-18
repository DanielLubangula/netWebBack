const mongoose = require('mongoose');

const PublicMessageSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    username: { 
        type: String, 
        required: true 
    },
    profilePicture: { 
        type: String, 
        default: '/uploads/profil/default_profil.webp' 
    },
    text: { 
        type: String, 
        required: true,
        maxlength: 500 
    },
    replyTo: {
        messageId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'PublicMessage' 
        },
        username: { 
            type: String 
        },
        text: { 
            type: String 
        }
    },
    isDeleted: { 
        type: Boolean, 
        default: false 
    }
}, { 
    timestamps: true 
});

// Index pour optimiser les requêtes
PublicMessageSchema.index({ createdAt: -1 });
PublicMessageSchema.index({ userId: 1 });
PublicMessageSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('PublicMessage', PublicMessageSchema); 