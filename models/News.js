const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre est obligatoire'],
    trim: true,
    maxlength: [120, 'Le titre ne peut pas dépasser 120 caractères']
  },
  summary: {
    type: String,
    required: [true, 'Le résumé est obligatoire'],
    trim: true,
    maxlength: [300, 'Le résumé ne peut pas dépasser 300 caractères']
  },
  content: {
    type: String,
    required: [true, 'Le contenu est obligatoire']
  },
  date: {
    type: Date,
    required: [true, 'La date est obligatoire'],
    default: Date.now
  },
  author: {
    type: String,
    required: [true, "L'auteur est obligatoire"],
    trim: true,
    maxlength: [50, "Le nom de l'auteur ne peut pas dépasser 50 caractères"]
  },
  category: {
    type: String,
    required: [true, 'La catégorie est obligatoire'],
    enum: {
      values: ['Nouveautés', 'Mise à jour', 'Événement', 'Éducation', 'Rapport'],
      message: 'Catégorie non valide'
    }
  },
  image: {
    type: String,
    required: [true, "L'image est obligatoire"]
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Mise à jour de la date de modification avant la sauvegarde
newsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('News', newsSchema);