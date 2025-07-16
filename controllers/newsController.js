const News = require('../models/News');
const fs = require('fs');
const path = require('path');

// @desc    Récupérer toutes les actualités
// @route   GET /api/news
// @access  Public
exports.getNews = async (req, res, next) => {
  try {
    const news = await News.find().sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      count: news.length,
      data: news
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Récupérer une actualité
// @route   GET /api/news/:id
// @access  Public
exports.getSingleNews = async (req, res, next) => {
  try {
    const news = await News.findById(req.params.id);

    if (!news) {
      return res.status(404).json({
        success: false,
        error: 'Actualité non trouvée'
      });
    }

    res.status(200).json({
      success: true,
      data: news
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Créer une actualité
// @route   POST /api/news
// @access  Privé/Admin
exports.createNews = async (req, res, next) => {
  try {
    // Vérifie si une image a été uploadée
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Veuillez uploader une image'
      });
    }

    const newsData = {
      ...req.body,
      image: `/uploads/images/${req.file.filename}`
    };

    const news = await News.create(newsData);

    res.status(201).json({
      success: true,
      data: news
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mettre à jour une actualité
// @route   PUT /api/news/:id
// @access  Privé/Admin
exports.updateNews = async (req, res, next) => {
  try {
    let news = await News.findById(req.params.id);

    if (!news) {
      return res.status(404).json({
        success: false,
        error: 'Actualité non trouvée'
      });
    }

    let imagePath = news.image;

    // Si une nouvelle image est uploadée
    if (req.file) {
      // Supprime l'ancienne image
      const oldImagePath = path.join(__dirname, `../${news.image}`);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
      imagePath = `/uploads/images/${req.file.filename}`;
    }

    const newsData = {
      ...req.body,
      image: imagePath
    };

    news = await News.findByIdAndUpdate(req.params.id, newsData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: news
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Supprimer une actualité
// @route   DELETE /api/news/:id
// @access  Privé/Admin
exports.deleteNews = async (req, res, next) => {
  try {
    const news = await News.findById(req.params.id);

    if (!news) {
      return res.status(404).json({
        success: false,
        error: 'Actualité non trouvée'
      });
    }

    // Supprime l'image associée
    const imagePath = path.join(__dirname, `../${news.image}`);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    await news.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Récupérer les actualités à la une
// @route   GET /api/news/featured
// @access  Public
exports.getFeaturedNews = async (req, res, next) => {
  try {
    const featuredNews = await News.find({ featured: true }).sort({ date: -1 }).limit(1);
    const regularNews = await News.find({ featured: false }).sort({ date: -1 }).limit(4);

    res.status(200).json({
      success: true,
      data: {
        featured: featuredNews[0] || null,
        regular: regularNews
      }
    });
  } catch (err) {
    next(err);
  }
};