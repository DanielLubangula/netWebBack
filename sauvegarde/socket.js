const { Server } = require("socket.io");

let io;

const jwt = require("jsonwebtoken");
const User = require("./models/User"); // Assurez-vous que le chemin vers le modèle User est correct
const onlineUsers = new Map(); // userId => socket.id

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
    console.log('utilisateur:', socket.userId);
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
          user.profilePicture = `${process.env.BACKEND_URL}${user.profilePicture}`; // Ajouter le préfixe au champ profilePicture
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

    socket.on("acceptChallenge", ({ toUserId, message }) => {
      const targetSocketId = onlineUsers.get(toUserId); // Récupérer le socket ID du demandeur
      const senderSocketId = socket.id; // Socket ID du destinataire (celui qui accepte)

      if (targetSocketId) {
        // Envoyer le message au demandeur
        io.to(targetSocketId).emit("challengeAccepted", {
          fromUserId: socket.userId, // ID de l'utilisateur qui a accepté le défi
          message,
        });

        // Envoyer le message au destinataire
        io.to(senderSocketId).emit("challengeAccepted", {
          toUserId, // ID de l'utilisateur qui a envoyé le défi
          message,
        });
      } else {
        // Si le demandeur n'est pas connecté, informer le destinataire
        socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });


  });
};

const getSocketInstance = () => io;
const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getSocketInstance, getOnlineUsers };
