const Notification = require('../models/Notification');
const User = require('../models/User');

// Récupérer toutes les notifications d'un utilisateur
exports.getUserNotifications = async (req, res) => {
  try {
  const notif = await Notification.find()
    // console.log(notif)

    console.log('req.user : ', req.user.id)
    const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications.' });
  }
};

// Marquer une notification comme lue
exports.markAsRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: 'Notification non trouvée.' });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
};

// Supprimer une notification
exports.deleteNotification = async (req, res) => {
  try {
    const notif = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!notif) return res.status(404).json({ error: 'Notification non trouvée.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
};

// Créer une notification (pour test ou usage admin)
exports.createNotification = async (req, res) => {
  try {
    const notif = new Notification({
      userId: req.body.userId,
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || 'info',
    });
    await notif.save();
    res.status(201).json(notif);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la création.' });
  }
};

// Envoyer une notification à tous les utilisateurs
exports.broadcastNotification = async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Titre et message requis.' });
    const users = await User.find({}, '_id');
    const notifs = await Promise.all(users.map(u =>
      Notification.create({ userId: u._id, title, message, type: type || 'info' })
    ));
    res.status(201).json({ success: true, count: notifs.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la diffusion.' });
  }
}; 