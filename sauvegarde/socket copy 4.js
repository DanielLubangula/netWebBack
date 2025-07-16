const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Match = require("./models/Match");

let io;
const onlineUsers = new Map();
const playerStatus = new Map();
const activeMatches = new Map();
const MATCH_TIMEOUT = 30 * 60 * 1000;
const QUESTIONS_DIR = path.join(__dirname, "data", "questions");

// Fonction pour parser les questions  
function parseQuestions(content, questionCount) {
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const rawBlocks = content.split(/###\s*(QCM|VF|Libre)/).slice(1);
  const questions = [];

  for (let i = 0; i < rawBlocks.length; i += 2) {
    const type = rawBlocks[i].trim();
    const block = rawBlocks[i + 1];
    const lines = block.trim().split("\n");

    const questionLineIndex = lines.findIndex(l => l.includes('**Question'));
    const question = lines[questionLineIndex + 1]?.trim() || '';

    const responseIndex = lines.findIndex(line => line.trim().startsWith('**Réponses')) + 1;
    const rawOptions = [];

    for (let j = responseIndex; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line.startsWith('-')) break;

      const isCorrect = line.includes('*');
      const text = line.replace(/\*/g, '').replace(/^-\s*/, '').trim();
      rawOptions.push({ text, isCorrect });
    }

    const shuffled = type === 'QCM' ? shuffleArray(rawOptions) : rawOptions;
    const options = shuffled.map(opt => opt.text);
    const correctIndex = shuffled.findIndex(opt => opt.isCorrect);

    const explanationIndex = lines.findIndex(line => line.trim().startsWith('**Explication')) + 1;
    const explanation = explanationIndex > 0 && lines[explanationIndex]
      ? lines[explanationIndex].trim()
      : '';

    questions.push({
      id: questions.length + 1,
      type,
      question,
      options,
      correct: correctIndex,
      explanation
    });
  }

  return shuffleArray(questions).slice(0, questionCount);
}

// Fonction pour nettoyer un match
function cleanupMatch(roomId) {
  const match = activeMatches.get(roomId);
  if (match) {
    clearTimeout(match.timeout);
    match.players.forEach(playerId => {
      playerStatus.delete(playerId);
    });
    activeMatches.delete(roomId);
  }
}

// Initialisation de Socket.io
const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Token manquant"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", async (socket) => {
    console.log("Nouvelle connexion:", socket.id, "User:", socket.userId);

    // Vérifier les matchs en cours
    const ongoingMatch = await Match.findOne({
      'players.userId': socket.userId,
      status: { $in: ['pending', 'in_progress'] }
    }).sort({ createdAt: -1 });

    if (ongoingMatch) {
      if (ongoingMatch.status === 'in_progress') {
        socket.emit("matchAlreadyInProgress", { 
          roomId: ongoingMatch.roomId,
          message: "Vous avez un match en cours"
        });
      } else {
        ongoingMatch.status = 'abandoned';
        ongoingMatch.players.forEach(p => {
          if (p.userId.toString() === socket.userId) p.abandoned = true;
        });
        await ongoingMatch.save();
      }
    }

    onlineUsers.set(socket.userId, socket.id);

    // Gestion de la déconnexion
    socket.on("disconnect", async () => {
      console.log("Déconnexion:", socket.id);
      onlineUsers.delete(socket.userId);
      
      const status = playerStatus.get(socket.userId);
      if (status?.inGame) {
        const roomId = status.roomId;
        const match = await Match.findOne({ roomId });
        
        if (match) {
          match.players.forEach(p => {
            if (p.userId.toString() === socket.userId) p.abandoned = true;
          });
          
          if (match.status === 'in_progress') {
            match.status = 'abandoned';
            await match.save();
            
            const otherPlayer = match.players.find(p => p.userId.toString() !== socket.userId);
            if (otherPlayer) {
              const otherSocketId = onlineUsers.get(otherPlayer.userId.toString());
              if (otherSocketId) {
                const results = match.calculateScores();
                io.to(otherSocketId).emit("playerLeft");
                io.to(otherSocketId).emit("challengeFinished", results);
                await match.save();
              }
            }
          }
        }
        
        cleanupMatch(roomId);
      }

      setTimeout(() => {
        if (!onlineUsers.has(socket.userId)) {
          playerStatus.delete(socket.userId);
        }
      }, 10000);
    });

    // Obtenir la liste des utilisateurs en ligne
    socket.on("getOnlineUsers", async (data) => {
      try {
        const users = await Promise.all(
          Array.from(onlineUsers.entries()).map(async ([userId, socketId]) => {
            if (playerStatus.get(userId)?.inGame) return null;

            const user = await User.findById(userId).lean();
            if (user) {
              if (user.profilePicture) {
                user.profilePicture = `http://localhost:5000${user.profilePicture}`;
              }
              return { ...user, socketId };
            }
            return null;
          })
        );

        const filteredUsers = users.filter(user => user !== null);
        socket.emit("onlineUsersList", filteredUsers);
      } catch (error) {
        console.error("Erreur:", error);
        socket.emit("onlineUsersList", {
          error: "Erreur lors de la récupération des utilisateurs",
        });
      }
    });

    // Envoyer un défi
    socket.on("sendChallenge", async ({ toUserId, challengeData }) => {
      if (playerStatus.get(socket.userId)?.inGame || playerStatus.get(toUserId)?.inGame) {
        return socket.emit("challengeError", { 
          message: "Un des joueurs est déjà dans un match" 
        });
      }

      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("receiveChallenge", {
          fromUserId: socket.userId,
          challengeData,
        });
      } else {
        socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });

    // Refuser un défi
    socket.on("declineChallenge", ({ toUserId, message }) => {
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeDeclined", {
          fromUserId: socket.userId,
          message,
        });
      } else {
        socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });

    // Accepter un défi
    socket.on("acceptChallenge", async ({ toUserId, challengeData }) => {
      const fromUserId = socket.userId;
      
      if (playerStatus.get(fromUserId)?.inGame || playerStatus.get(toUserId)?.inGame) {
        return socket.emit("challengeError", { 
          message: "Un des joueurs est déjà dans un match" 
        });
      }

      const roomId = [fromUserId, toUserId].sort().join("_");
      const fromSocketId = onlineUsers.get(toUserId);
      const toSocketId = socket.id;

      if (!fromSocketId) {
        return socket.emit("challengeError", { message: "L'autre joueur s'est déconnecté" });
      }

      try {
        // Récupérer les infos des joueurs
        const [fromUser, toUser] = await Promise.all([
          User.findById(fromUserId).lean(),
          User.findById(toUserId).lean()
        ]);

        if (!fromUser || !toUser) {
          return socket.emit("matchError", { message: "Utilisateur introuvable" });
        }

        // Charger les questions
        const themeName = challengeData.theme;
        const questionCount = challengeData.questionCount;
        const filename = `${themeName.toLowerCase().replace(/\s+/g, '-')}.md`;
        const filePath = path.join(QUESTIONS_DIR, filename);

        if (!fs.existsSync(filePath)) {
          return socket.emit("matchError", { message: "Thème introuvable" });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsedQuestions = parseQuestions(content, questionCount);

        // Créer un nouveau match dans la base de données
        const newMatch = new Match({
          roomId,
          players: [
            { 
              userId: fromUserId,
              username: fromUser.username,
              profilePicture: fromUser.profilePicture
            },
            { 
              userId: toUserId,
              username: toUser.username,
              profilePicture: toUser.profilePicture
            }
          ],
          theme: challengeData.theme,
          questions: parsedQuestions,
          status: 'in_progress'
        });

        await newMatch.save();

        // Rejoindre la room
        socket.join(roomId);
        io.sockets.sockets.get(fromSocketId)?.join(roomId);

        // Mettre à jour les statuts
        playerStatus.set(fromUserId, { inGame: true, roomId });
        playerStatus.set(toUserId, { inGame: true, roomId });

        // Configurer le timeout
        const timeout = setTimeout(async () => {
          const match = await Match.findOne({ roomId });
          if (match && match.status === 'in_progress') {
            match.status = 'abandoned';
            await match.save();
            io.to(roomId).emit("matchTimeout");
          }
          cleanupMatch(roomId);
        }, MATCH_TIMEOUT);

        activeMatches.set(roomId, { 
          players: [fromUserId, toUserId],
          timeout 
        });

        // Démarrer le match
        io.to(roomId).emit("matchStarted", {
          roomId,
          players: [fromUser, toUser],
          challengeData,
          questions: parsedQuestions,
          message: "Le match peut commencer !"
        });

      } catch (err) {
        console.error('Erreur:', err);
        await Match.deleteOne({ roomId });
        io.to(roomId).emit("matchError", { message: "Erreur lors du démarrage" });
        cleanupMatch(roomId);
      }
    });

    // Envoyer un message dans le salon
    socket.on("messageInRoom", ({ roomId, text }) => {
      io.to(roomId).emit("messageInRoom", {
        text,
        from: socket.userId
      });
    });

    // Répondre à une question
    socket.on("answerQuestion", async ({ roomId, questionId, answerIndex, timeLeft }) => {
      if (!playerStatus.get(socket.userId)?.inGame) {
        return socket.emit("error", { message: "Vous n'êtes pas dans un match" });
      }

      try {
        const match = await Match.findOne({ roomId });
        if (!match) return;

        const player = match.players.find(p => p.userId.toString() === socket.userId);
        if (!player) return;

        const question = match.questions.find(q => q.id === questionId);
        const isCorrect = question?.correct === answerIndex;

        player.answers.push({
          questionId,
          answerIndex,
          timeTaken: 15 - timeLeft,
          isCorrect
        });

        await match.save();

        io.to(roomId).emit("playerAnswered", {
          playerId: socket.userId,
          answerIndex,
          timeLeft,
        });

        // Vérifier si tous ont répondu
        const allAnswered = match.players.every(p => 
          p.answers.some(a => a.questionId === questionId)
        );

        if (allAnswered) {
          setTimeout(() => {
            const currentQuestionIndex = match.questions.findIndex(q => q.id === questionId);
            const nextIndex = currentQuestionIndex + 1;
            
            if (nextIndex < match.questions.length) {
              io.to(roomId).emit("forceNextQuestion", { newIndex: nextIndex });
            } else {
              // Fin du match
              const results = match.calculateScores();
              io.to(roomId).emit("challengeFinished", results);
              cleanupMatch(roomId);
              match.save();
            }
          }, 1500);
        }
      } catch (err) {
        console.error("Erreur enregistrement réponse:", err);
      }
    });

    // Quitter un match
    socket.on("playerLeft", async ({ roomId }) => {
      try {
        const match = await Match.findOne({ roomId });
        if (!match) return;

        match.players.forEach(p => {
          if (p.userId.toString() === socket.userId) p.abandoned = true;
        });
        
        match.status = 'abandoned';
        const results = match.calculateScores();
        await match.save();

        socket.to(roomId).emit("playerLeft");
        socket.to(roomId).emit("challengeFinished", results);
        
        cleanupMatch(roomId);
      } catch (err) {
        console.error("Erreur abandon match:", err);
      }
    });
  
    // Terminer un match
    socket.on("finishChallenge", ({ roomId, results }) => {
      cleanupMatch(roomId);
      io.to(roomId).emit("challengeFinished", results);
    });
  });
};

const getSocketInstance = () => io;
const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getSocketInstance, getOnlineUsers };