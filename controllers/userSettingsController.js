const User = require('../models/User');
const Notification = require('../models/Notification');

// GET user settings
exports.getUserSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json(user.settings || {});
  } catch (err) {
    next(err);
  }
};

// UPDATE user settings
exports.updateUserSettings = async (req, res, next) => {
  console.log(req.body);
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ message: 'Paramètres invalides' });
  }
  
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.settings = req.body;
    await user.save();
    // Créer une notification
    await Notification.create({
      userId: user._id,
      title: 'Paramètres modifiés',
      message: 'Vos paramètres ont bien été mis à jour.',
      type: 'success',
    });
    res.json(user.settings);
  } catch (err) {
    next(err);
  }
};

// GET user profile
exports.getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// UPDATE user profile
exports.updateUserProfile = async (req, res, next) => {
  try {
    console.log(req.body);
    // On extrait le mot de passe actuel et le nouveau mot de passe si présents
    const { currentPassword, newPassword, ...updateData } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    // Si on veut changer le mot de passe
    if (currentPassword && newPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }
      
      // Mettre à jour le mot de passe
      user.password = newPassword;
      await user.save();
    }

    // Mettre à jour les autres données
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id, 
      updateData, 
      { new: true, runValidators: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
};