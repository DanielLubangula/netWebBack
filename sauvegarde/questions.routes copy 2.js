// === socketServer.js ===
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const User = require("./models/User");

let io;
const onlineUsers = new Map(); // userId => socket.id
const QUESTIONS_DIR = path.join(__dirname, "questions"); // Adapter si besoin

const loadQuestions = (theme, count) => {
  const filename = `${theme.toLowerCase().replace(/\s+/g, '-')}.md`;
  const filePath = path.join(QUESTIONS_DIR, filename);

  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');

  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  try {
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

    return shuffleArray(questions).slice(0, count);
  } catch (err) {
    console.error("Erreur parsing:", err);
    return null;
  }
};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
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
    onlineUsers.set(socket.userId, socket.id);

    socket.on("disconnect", () => {
      onlineUsers.delete(socket.userId);
    });

    socket.on("sendChallenge", ({ toUserId, challengeData }) => {
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("receiveChallenge", {
          fromUserId: socket.userId,
          challengeData,
        });
      }
    });

    socket.on("declineChallenge", ({ toUserId, message }) => {
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("challengeDeclined", {
          fromUserId: socket.userId,
          message,
        });
      }
    });

    socket.on("acceptChallenge", ({ toUserId, message, challengeData }) => {
      const fromSocketId = onlineUsers.get(toUserId);
      const toSocketId = socket.id;

      if (fromSocketId) {
        const roomId = [toUserId, socket.userId].sort().join("_");
        socket.join(roomId);
        io.sockets.sockets.get(fromSocketId)?.join(roomId);

        const questions = loadQuestions(challengeData.theme, challengeData.questionCount);
        if (!questions) {
          return socket.emit("challengeError", { message: "Erreur de chargement des questions" });
        }

        io.to(roomId).emit("matchStarted", {
          roomId,
          players: [toUserId, socket.userId],
          challengeData,
          message: "Le match peut commencer !",
          questions,
        });
      } else {
        socket.emit("challengeError", { message: "Utilisateur non connecté" });
      }
    });
  });
};

const getSocketInstance = () => io;
const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getSocketInstance, getOnlineUsers };
