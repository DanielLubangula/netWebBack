const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');

let io;

const jwt = require("jsonwebtoken");
const User = require("./models/User"); // Assurez-vous que le chemin vers le modèle User est correct
const onlineUsers = new Map(); // userId => socket.id

const QUESTIONS_DIR = path.join(__dirname, 'data', 'questions'); // Chemin vers les fichiers de questions

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

  io.on("connection", (socket) => {
    // Associer l'utilisateur à son socket
    onlineUsers.set(socket.userId, socket.id);

    socket.on("disconnect", () => {
      console.log("Déconnexion :", socket.id);
      onlineUsers.delete(socket.userId);
    });

    socket.on("message", (data) => {
      socket.emit("response", { message: "Message reçu avec succès" });
    });

    socket.on("getOnlineUsers", async (data) => {
      console.log("Récupération des utilisateurs connectés", onlineUsers );
      try {
        const users = await Promise.all(
          Array.from(onlineUsers.entries()).map(async ([userId, socketId]) => {
            const user = await User.findById(userId).lean(); // Récupérer les informations utilisateur depuis le modèle User
            if (user) {
              if (user.profilePicture) {
          user.profilePicture = `http://localhost:5000${user.profilePicture}`; // Ajouter le préfixe au champ profilePicture
              } 
              return { ...user, socketId }; // Ajouter le champ socketId aux données utilisateur
            }
            return null; // Si l'utilisateur n'est pas trouvé, retourner null
          })
        );

        const filteredUsers = users.filter((user) => user !== null); // Filtrer les utilisateurs non trouvés
        socket.emit("onlineUsersList", filteredUsers); // Envoyer le tableau d'objets utilisateur enrichi
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des utilisateurs connectés:",
          error
        );
        socket.emit("onlineUsersList", {
          error: "Erreur lors de la récupération des utilisateurs connectés",
        });
      }
    });

    socket.on("sendChallenge", async ({ toUserId, challengeData }) => {
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

    socket.on("declineChallenge", ({ toUserId, message }) => {
      const targetSocketId = onlineUsers.get(toUserId); // Récupérer le socket ID du destinataire
      console.log("Décliné", targetSocketId)
      if (targetSocketId) {
        // Envoyer le message au destinataire
        io.to(targetSocketId).emit("challengeDeclined", {
          fromUserId: socket.userId, // ID de l'utilisateur qui a décliné le défi
          message,
        });
      } else {
        // Si le destinataire n'est pas connecté, informer l'expéditeur
        socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });

    socket.on("acceptChallenge", async ({ toUserId, message, challengeData }) => {
      console.log("Accepté", toUserId, socket.userId, challengeData);

      const fromSocketId = onlineUsers.get(toUserId); // Demandeur du défi
      const toSocketId = socket.id; // Celui qui accepte

      if (fromSocketId) {
      // Générer un ID unique pour la salle (ordre alphabétique pour éviter les doublons)
      const roomId = [toUserId, socket.userId].sort().join("_");

      // Ajouter les deux sockets dans le salon
      socket.join(roomId);
      io.sockets.sockets.get(fromSocketId)?.join(roomId);

      try {
        // Récupérer les informations des utilisateurs
        const fromUser = await User.findById(toUserId).lean();
        const toUser = await User.findById(socket.userId).lean();

        if (!fromUser || !toUser) {
        io.to(roomId).emit("matchError", { message: "Utilisateur introuvable" });
        return;
        }

        // Supprimer les informations sensibles
        delete fromUser.password;
        delete toUser.password;

        // Récupérer les questions du thème
        const themeName = challengeData.theme;
        const questionCount = challengeData.questionCount;
        const filename = `${themeName.toLowerCase().replace(/\s+/g, '-')}.md`;
        const filePath = path.join(QUESTIONS_DIR, filename);

        if (!fs.existsSync(filePath)) {
        // Informer les deux utilisateurs que le thème est introuvable
        io.to(roomId).emit("matchError", { message: "Thème introuvable" });
        return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

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
        const lines = block.trim().split('\n');

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

        const shuffledQuestions = shuffleArray(questions);
        const limitedQuestions = shuffledQuestions.slice(0, questionCount);

        // Informer les deux joueurs qu’ils sont dans le même salon et leur envoyer les questions
        io.to(roomId).emit("matchStarted", {
        roomId,
        players: [fromUser, toUser],
        challengeData,
        questions: limitedQuestions,
        message: "Le match peut commencer !",
        });

      } catch (err) {
        console.error('Erreur de parsing ou récupération des utilisateurs :', err);
        io.to(roomId).emit("matchError", { message: "Erreur lors de la récupération des données" });
      }
      } else {
      socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });
    socket.on('messageInRoom', ({roomId, text}) => {
      io.to(roomId).emit("messageInRoom", {
        text,
        from : socket.userId || 'voiolà'
      })
    })

  });
};

const getSocketInstance = () => io;
const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getSocketInstance, getOnlineUsers };
