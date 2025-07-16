const User = require('../models/User');
const News = require('../models/News');
const Match = require('../models/Match');
const fs = require('fs');
const path = require('path');

// Dashboard global stats
exports.getDashboardStats = async (req, res, next) => {
  try {
    const userCount = await User.countDocuments();
    const newsCount = await News.countDocuments();
    const matchCount = await Match.countDocuments();
    // Ajoute d'autres stats si besoin
    res.json({
      userCount,
      newsCount,
      matchCount
    });
  } catch (err) {
    next(err);
  }
};

// Gestion utilisateurs
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
    console.log('getAllUsers :')
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Gestion thèmes/questions (CRUD sur fichiers)
const QUESTIONS_DIR = path.join(__dirname, '..', 'data', 'questions');

exports.getThemes = async (req, res, next) => {
  try {
    const files = fs.readdirSync(QUESTIONS_DIR);
    const themes = files.map(file => path.basename(file, path.extname(file)));
    res.json(themes);
  } catch (err) {
    next(err);
  }
};

exports.createTheme = async (req, res, next) => {
  try {
    const { theme, content } = req.body;
    if (!theme || !content) return res.status(400).json({ message: 'Theme et contenu requis' });
    const filename = `${theme.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(QUESTIONS_DIR, filename);
    if (fs.existsSync(filePath)) return res.status(400).json({ message: 'Thème déjà existant' });
    fs.writeFileSync(filePath, content.trim(), 'utf-8');
    res.json({ message: 'Thème créé' });
  } catch (err) {
    next(err);
  }
};

exports.updateTheme = async (req, res, next) => {
  try {
    const { theme, content } = req.body;
    const filename = `${theme.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(QUESTIONS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Thème non trouvé' });
    fs.writeFileSync(filePath, content.trim(), 'utf-8');
    res.json({ message: 'Thème mis à jour' });
  } catch (err) {
    next(err);
  }
};

exports.deleteTheme = async (req, res, next) => {
  try {
    const { theme } = req.params;
    const filename = `${theme.toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(QUESTIONS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Thème non trouvé' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Thème supprimé' });
  } catch (err) {
    next(err);
  }
};

// Settings globaux (fichier JSON simple)
const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'settings.json');

exports.getSettings = (req, res, next) => {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ maintenance: false }, null, 2));
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = (req, res, next) => {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}; 