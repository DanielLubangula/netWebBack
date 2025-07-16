// services/index.js
const User = require('../models/User');
const Match = require('../models/Match');
const UserUpdater = require('./userUpdater.service');

function initializeServices() {
  UserUpdater.initialize(Match, User);
}

module.exports = {
  initializeServices,
  UserUpdater
};