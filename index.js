// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { initializeSocket } = require('./socket'); // Import du socket
const passport = require('passport'); 

dotenv.config(); 
require('./config/passport');

const app = express(); 
// Configuration CORS plus précise
const corsOptions = {
    origin: process.env.FRONTEND_URL, // Utilise la variable d'environnement
    credentials: true, // Autorise les credentials
    optionsSuccessStatus: 200 // Pour les navigateurs legacy
  }; 
  
  app.use(cors()); 
  // app.use(cors(corsOptions)); 
app.use(express.json());
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connexion à MongoDB
require('./config/db')();

// Routes
app.use('/api/local/auth', require('./routes/auth.routes.js'));
app.use('/api/auth/', require('./routes/auth.google.routes.js'));
app.use('/api/profil', require('./routes/profil.routes.js'));
app.use('/api/questions', require('./routes/questions.routes.js'));
app.use('/api/matches', require('./routes/matches.routes.js'));
app.use('/api/online-users', require('./routes/online.routes.js'));
app.use("/all/matches", require('./routes/allMatches.routes.js'));
// Routes
app.use('/api/news', require("./routes/news.routes"));
app.use('/api/admin', require('./routes/admin.routes.js'));
app.use('/api/user', require('./routes/userSettings.routes.js'));
app.use('/api/notifications', require('./routes/notifications.routes.js'));
 
app.get("/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// Création du serveur HTTP
const server = http.createServer(app);

// Initialisation de Socket.io
initializeSocket(server);
  
// Démarrage du serveur
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
   