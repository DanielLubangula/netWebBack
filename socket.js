const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Match = require("./models/Match");
const PublicMessage = require("./models/PublicMessage");
const Notification = require("./models/Notification");

let io;
const onlineUsers = new Map();
const playerStatus = new Map();
const activeMatches = new Map();
const matchSpectators = new Map(); // Nouveau: pour suivre les spectateurs
const MATCH_TIMEOUT = 30 * 60 * 1000;
const QUESTIONS_DIR = path.join(__dirname, "data", "questions");
// Ajout d'un timeout par question pour éviter le blocage si personne ne répond
const QUESTION_TIMEOUT = 20 * 1000; // 20 secondes par question max (ajustable)

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

    const questionLineIndex = lines.findIndex((l) => l.includes("**Question"));
    const question = lines[questionLineIndex + 1]?.trim() || "";

    const responseIndex =
      lines.findIndex((line) => line.trim().startsWith("**Réponses")) + 1;
    const rawOptions = [];

    for (let j = responseIndex; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line.startsWith("-")) break;

      const isCorrect = line.includes("*");
      const text = line.replace(/\*/g, "").replace(/^-\s*/, "").trim();
      rawOptions.push({ text, isCorrect });
    }

    const shuffled = type === "QCM" ? shuffleArray(rawOptions) : rawOptions;
    const options = shuffled.map((opt) => opt.text);
    const correctIndex = shuffled.findIndex((opt) => opt.isCorrect);

    const explanationIndex =
      lines.findIndex((line) => line.trim().startsWith("**Explication")) + 1;
    const explanation =
      explanationIndex > 0 && lines[explanationIndex]
        ? lines[explanationIndex].trim()
        : "";

    questions.push({
      id: questions.length + 1,
      type,
      question,
      options,
      correct: correctIndex,
      explanation,
    });
  }

  return shuffleArray(questions).slice(0, questionCount);
}

// Fonction pour nettoyer un match
function cleanupMatch(roomId) {
  const match = activeMatches.get(roomId);
  if (match) {
    clearTimeout(match.timeout);
    match.players.forEach((playerId) => {
      playerStatus.delete(playerId);
    });
    activeMatches.delete(roomId);
  }
  // Nettoyer aussi les spectateurs
  if (matchSpectators.has(roomId)) {
    matchSpectators.delete(roomId);
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
      "players.userId": socket.userId,
      status: { $in: ["pending", "in_progress"] },
    }).sort({ createdAt: -1 });

    if (ongoingMatch) {
      if (ongoingMatch.status === "in_progress") {
        socket.emit("matchAlreadyInProgress", {
          roomId: ongoingMatch.roomId,
          message: "Vous avez un match en cours",
        });
      } else {
        ongoingMatch.status = "abandoned";
        ongoingMatch.players.forEach((p) => {
          if (p.userId.toString() === socket.userId) p.abandoned = true;
        });
        await ongoingMatch.save();
      }
    }

    onlineUsers.set(socket.userId, socket.id);

    // Nouvel événement pour rejoindre en tant que spectateur
    socket.on("joinAsSpectator", async ({ roomId }) => {
      try {
        const match = await Match.findOne({ roomId });
        if (!match) {
          return socket.emit("spectatorError", { message: "Match introuvable" });
        }

        socket.join(roomId);
        
        if (!matchSpectators.has(roomId)) {
          matchSpectators.set(roomId, new Set());
        }
        
        console.log("Add socket ", socket.id)

        matchSpectators.get(roomId).add(socket.id);
        
        // Notifier tout le monde du nouveau spectateur
        io.to(roomId).emit("spectatorCount", { 
          count: matchSpectators.get(roomId).size 
        });
        
        // Envoyer l'état actuel du match au spectateur
        const currentQuestionIndex = match.players.reduce((maxIndex, player) => {
          const lastAnswer = player.answers[player.answers.length - 1];
          return lastAnswer ? Math.max(maxIndex, lastAnswer.questionId) : maxIndex;
        }, 0);
        
        // console.log('currentQ : ', match)

        socket.emit("matchSnapshot", {
          players: match.players,
          currentQuestionIndex,
          playerAnswers: match.players.reduce((acc, player) => {
            acc[player.userId] = player.answers;
            return acc;
          }, {}),
          questions: match.questions,
          status: match.status,
          timeLeft: 15 // Valeur par défaut
        });
      } catch (err) {
        console.error("Erreur joinAsSpectator:", err);
        socket.emit("spectatorError", { message: "Erreur interne" });
      }
    });

    // Gestion de la déconnexion
    socket.on("disconnect", async () => {
      console.log("Déconnexion:", socket.id);
      onlineUsers.delete(socket.userId);

      // Gestion des spectateurs
      matchSpectators.forEach((spectators, roomId) => {
        if (spectators.has(socket.id)) {
          spectators.delete(socket.id);
          if (spectators.size === 0) {
            matchSpectators.delete(roomId);
          } else {
            io.to(roomId).emit("spectatorCount", { count: spectators.size });
          }
        }
      });

      const status = playerStatus.get(socket.userId);
      if (status?.inGame) {
        const roomId = status.roomId;
        const match = await Match.findOne({ roomId });

        if (match) {
          match.players.forEach((p) => {
            if (p.userId.toString() === socket.userId) p.abandoned = true;
          });

          if (match.status === "in_progress") {
            match.status = "abandoned";
            await match.save();

            const otherPlayer = match.players.find(
              (p) => p.userId.toString() !== socket.userId
            );
            if (otherPlayer) {
              const otherSocketId = onlineUsers.get(
                otherPlayer.userId.toString()
              );
              if (otherSocketId) {
                const results = match.calculateScores(socket.userId);
                io.to(otherSocketId).emit("playerLeft");
                match.status = "abandoned";
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
                user.profilePicture = `${process.env.BACKEND_URL}${user.profilePicture}`;
              }
              return { ...user, socketId };
            }
            return null;
          })
        );

        const filteredUsers = users.filter((user) => user !== null);
        socket.emit("onlineUsersList", filteredUsers);
      } catch (error) {
        console.error("Erreur:", error);
        socket.emit("onlineUsersList", {
          error: "Erreur lors de la récupération des utilisateurs",
        });
      }
    });

    // Obtenir la liste des matchs en direct
    socket.on("getLiveMatches", async () => {
      try {
        // Récupère les matchs en cours (status: "in_progress")
        const matches = await Match.find({ status: "in_progress" })
          .select("roomId players theme createdAt")
          .lean();
        socket.emit("liveMatchesList", matches);
      } catch (err) {
        socket.emit("liveMatchesList", { error: "Erreur lors de la récupération des matchs" });
      }
    });

    // Envoyer un défi
    socket.on("sendChallenge", async ({ toUserId, challengeData }) => {
      if (
        playerStatus.get(socket.userId)?.inGame ||
        playerStatus.get(toUserId)?.inGame
      ) {
        return socket.emit("challengeError", {
          message: "Un des joueurs est déjà dans un match",
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

      if (
        playerStatus.get(fromUserId)?.inGame ||
        playerStatus.get(toUserId)?.inGame
      ) {
        return socket.emit("challengeError", {
          message: "Un des joueurs est déjà dans un match",
        });
      }

      const prefix = generateRoomPrefix();

      const roomId = `${prefix}_${[fromUserId, toUserId].sort().join("_")}`;
      const fromSocketId = onlineUsers.get(toUserId);
      const toSocketId = socket.id;

      if (!fromSocketId) {
        return socket.emit("challengeError", {
          message: "L'autre joueur s'est déconnecté",
        });
      }

      try {
        // Récupérer les infos des joueurs
        const [fromUser, toUser] = await Promise.all([
          User.findById(fromUserId).lean(),
          User.findById(toUserId).lean(),
        ]);

        if (!fromUser || !toUser) {
          return socket.emit("matchError", {
            message: "Utilisateur introuvable",
          });
        }

        // Charger les questions
        const themeName = challengeData.theme;
        const questionCount = challengeData.questionCount;
        const filename = `${themeName.toLowerCase().replace(/\s+/g, "-")}.md`;
        const filePath = path.join(QUESTIONS_DIR, filename);

        if (!fs.existsSync(filePath)) {
          return socket.emit("matchError", { message: "Thème introuvable" });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const parsedQuestions = parseQuestions(content, questionCount);

        // Créer un nouveau match dans la base de données
        const newMatch = new Match({
          roomId,
          players: [
            {
              userId: fromUserId,
              username: fromUser.username,
              profilePicture: fromUser.profilePicture,
            },
            {
              userId: toUserId,
              username: toUser.username,
              profilePicture: toUser.profilePicture,
            },
          ],
          theme: challengeData.theme,
          questions: parsedQuestions,
          status: "in_progress",
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
          if (match && match.status === "in_progress") {
            match.status = "abandoned";
            await match.save();
            io.to(roomId).emit("matchTimeout");
          }
          cleanupMatch(roomId);
        }, MATCH_TIMEOUT);

        activeMatches.set(roomId, {
          players: [fromUserId, toUserId],
          timeout,
        });

        // Démarrer le match
        io.to(roomId).emit("matchStarted", {
          roomId,
          players: [fromUser, toUser],
          challengeData,
          questions: parsedQuestions,
          message: "Le match peut commencer !",
        });
      } catch (err) {
        console.error("Erreur:", err);
        await Match.deleteOne({ roomId });
        io.to(roomId).emit("matchError", {
          message: "Erreur lors du démarrage",
        });
        cleanupMatch(roomId);
      }
    });

    // Envoyer un message dans le salon
    socket.on("messageInRoom", ({ roomId, text }) => {
      io.to(roomId).emit("messageInRoom", {
        text,
        from: socket.userId,
      });
    });

    // Répondre à une question
    socket.on(
      "answerQuestion",
      async ({ roomId, questionId, answerIndex, timeLeft }) => {
        if (!playerStatus.get(socket.userId)?.inGame) {
          return socket.emit("error", {
            message: "Vous n'êtes pas dans un match",
          });
        }

        try {
          const match = await Match.findOne({ roomId });
          if (!match) return;

          const player = match.players.find(
            (p) => p.userId.toString() === socket.userId
          );
          if (!player) return;

          const question = match.questions.find((q) => q.id === questionId);
          const isCorrect = question?.correct === answerIndex;

          player.answers.push({
            questionId,
            answerIndex,
            timeTaken: 15 - timeLeft,
            isCorrect,
          });

          await match.save();

          io.to(roomId).emit("playerAnswered", {
            playerId: socket.userId,
            answerIndex,
            timeLeft,
          });

          // Vérifier si tous ont répondu
          const allAnswered = match.players.every((p) =>
            p.answers.some((a) => a.questionId === questionId)
          );

          // Timeout pour forcer la fin de la question si personne ne répond
          if (!match._questionTimeouts) match._questionTimeouts = {};
          if (!match._questionTimeouts[questionId]) {
            match._questionTimeouts[questionId] = setTimeout(async () => {
              // Si la question n'est pas terminée, on force la fin
              const refreshedMatch = await Match.findOne({ roomId });
              const allAnsweredNow = refreshedMatch.players.every((p) =>
                p.answers.some((a) => a.questionId === questionId)
              );
              if (!allAnsweredNow) {
                // On passe à la question suivante ou on termine
                const currentQuestionIndex = refreshedMatch.questions.findIndex(
                  (q) => q.id === questionId
                );
                const nextIndex = currentQuestionIndex + 1;
                if (nextIndex < refreshedMatch.questions.length) {
                  io.to(roomId).emit("forceNextQuestion", {
                    newIndex: nextIndex,
                  });
                } else {
                  // Fin du match forcée
                  const results = await refreshedMatch.calculateScores();
                  io.to(roomId).emit("challengeFinished", results);
                  cleanupMatch(roomId);
                  await refreshedMatch.save();
                }
              }
            }, QUESTION_TIMEOUT);
          }

          if (allAnswered) {
            clearTimeout(match._questionTimeouts?.[questionId]);
            setTimeout(() => {
              const currentQuestionIndex = match.questions.findIndex(
                (q) => q.id === questionId
              );
              const nextIndex = currentQuestionIndex + 1;
              if (nextIndex < match.questions.length) {
                io.to(roomId).emit("forceNextQuestion", {
                  newIndex: nextIndex,
                });
              } else {
                // Fin du match
                match.calculateScores().then((results) => {
                  io.to(roomId).emit("challengeFinished", results);
                  cleanupMatch(roomId);
                  match.save();
                });
              }
            }, 1500);
          }
        } catch (err) {
          console.error("Erreur enregistrement réponse:", err);
        }
      }
    );

    // Quitter un match
    socket.on("playerLeft", async ({ roomId }) => {
      try {
        const match = await Match.findOne({ roomId });
        if (!match) return;

        match.players.forEach((p) => {
          if (p.userId.toString() === socket.userId) p.abandoned = true;
        });

        match.status = "abandoned";
        const results = match.calculateScores(socket.userId);
        await match.save();
        console.log("match fini one")
        socket.to(roomId).emit("playerLeft");
        socket.to(roomId).emit("challengeFinished", results);

        cleanupMatch(roomId);
      } catch (err) {
        console.error("Erreur abandon match:", err);
      }
    });

    // Terminer un match
    socket.on("finishChallenge", async ({ roomId, results }) => {
      const match = await Match.findOne({ roomId });
      if (!match) return;

      // Fin du match
      match.calculateScores().then((results) => {
        cleanupMatch(roomId);
         console.log("match fini two")
        io.to(roomId).emit("challengeFinished", results);
      });
    });

    // === CHAT PUBLIC ===
    
    // Rejoindre le chat public
    socket.on("joinPublicChat", () => {
      socket.join("public-chat");
      console.log(`Utilisateur ${socket.userId} a rejoint le chat public`);
    });

    // Quitter le chat public
    socket.on("leavePublicChat", () => {
      socket.leave("public-chat");
      console.log(`Utilisateur ${socket.userId} a quitté le chat public`);
    });

    // Nouveau message public
    socket.on("newPublicMessage", async ({ text, replyTo }) => {
      try {
        if (!text || text.trim().length === 0) {
          return socket.emit("publicMessageError", { message: "Le message ne peut pas être vide" });
        }

        if (text.length > 500) {
          return socket.emit("publicMessageError", { message: "Le message ne peut pas dépasser 500 caractères" });
        }

        // Récupérer les informations de l'utilisateur
        const user = await User.findById(socket.userId).select('username profilePicture');
        if (!user) {
          return socket.emit("publicMessageError", { message: "Utilisateur non trouvé" });
        }

        let replyData = null;
        let originalMessageAuthor = null;
        
        if (replyTo && replyTo.messageId) {
          const originalMessage = await PublicMessage.findById(replyTo.messageId);
          if (originalMessage && !originalMessage.isDeleted) {
            replyData = {
              messageId: originalMessage._id,
              username: originalMessage.username,
              text: originalMessage.text
            };
            
            // Récupérer l'auteur du message original pour la notification
            originalMessageAuthor = await User.findById(originalMessage.userId).select('username');
          }
        }

        const newMessage = new PublicMessage({
          userId: socket.userId,
          username: user.username,
          profilePicture: user.profilePicture,
          text: text.trim(),
          replyTo: replyData
        });

        console.log('newMessage : ',newMessage)

        await newMessage.save();

        // Envoyer une notification à l'auteur du message original si c'est une réponse
        if (replyData && originalMessageAuthor && originalMessageAuthor._id.toString() !== socket.userId.toString()) {
          try {
            const notification = new Notification({
              userId: originalMessageAuthor._id,
              title: 'Nouvelle réponse à votre message',
              message: `${user.username} a répondu à votre message dans le chat public`,
              type: 'info'
            });
            await notification.save();
            console.log(`Notification envoyée à ${originalMessageAuthor.username} pour la réponse de ${user.username}`);
            
            // Envoyer la notification en temps réel si l'utilisateur est en ligne
            const originalAuthorSocketId = onlineUsers.get(originalMessageAuthor._id.toString());
            if (originalAuthorSocketId) {
              io.to(originalAuthorSocketId).emit('newNotification', {
                id: notification._id,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                createdAt: notification.createdAt
              });
            }
          } catch (notificationError) {
            console.error('Erreur lors de l\'envoi de la notification:', notificationError);
            // Ne pas faire échouer l'envoi du message si la notification échoue
          }
        }
 
        const formattedMessage = {
          _id: newMessage._id,
          text: newMessage.text,
          username: newMessage.username,
          profilePicture: newMessage.profilePicture.startsWith('http') 
            ? newMessage.profilePicture 
            : `${process.env.BACKEND_URL}${newMessage.profilePicture}`,
          replyTo: newMessage.replyTo,
          createdAt: newMessage.createdAt,
          updatedAt: newMessage.updatedAt
        };

        // Diffuser le message à tous les utilisateurs du chat public
        io.to("public-chat").emit("publicMessageReceived", formattedMessage);
        
        socket.emit("publicMessageSent", { message: "Message envoyé avec succès" });
      } catch (error) {
        console.error("Erreur lors de l'envoi du message public:", error);
        socket.emit("publicMessageError", { message: "Erreur lors de l'envoi du message" });
      }
    });

    // Supprimer un message public
    socket.on("deletePublicMessage", async ({ messageId }) => {
      try {
        const message = await PublicMessage.findById(messageId);
        
        if (!message) {
          return socket.emit("publicMessageError", { message: "Message non trouvé" });
        }

        if (message.userId.toString() !== socket.userId) {
          return socket.emit("publicMessageError", { message: "Vous n'êtes pas autorisé à supprimer ce message" });
        }

        message.isDeleted = true;
        await message.save();

        // Notifier tous les utilisateurs de la suppression
        io.to("public-chat").emit("publicMessageDeleted", { messageId });
        
        socket.emit("publicMessageDeleted", { message: "Message supprimé avec succès" });
      } catch (error) {
        console.error("Erreur lors de la suppression du message public:", error);
        socket.emit("publicMessageError", { message: "Erreur lors de la suppression" });
      }
    });
  });
};

function generateRoomPrefix() {
  const now = new Date();
  const prefix = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    String(now.getMilliseconds()).padStart(3, "0"),
  ].join("");
  return `M${prefix}`; 
}

const getSocketInstance = () => io;
const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getSocketInstance, getOnlineUsers };