// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { initializeSocket } = require('./socket'); // Import du socket

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connexion à MongoDB
require('./config/db')();

// Routes
app.use('/api/auth', require('./routes/auth.routes.js'));
app.use('/api/profil', require('./routes/profil.routes.js'));
app.use('/api/questions', require('./routes/questions.routes.js'));
app.use('/api/matches', require('./routes/matches.routes.js'));
app.use('/api/online-users', require('./routes/online.routes.js'));
app.use("/all/matches", require('./routes/allMatches.routes.js'));

// Création du serveur HTTP
const server = http.createServer(app);

// Initialisation de Socket.io
initializeSocket(server);

// Démarrage du serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
