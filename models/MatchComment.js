const mongoose = require('mongoose');

const matchCommentSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
matchCommentSchema.index({ matchId: 1, createdAt: -1 });

module.exports = mongoose.model('MatchComment', matchCommentSchema); 