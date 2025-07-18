const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  type: { type: String, enum: ["QCM", "VF", "Libre"], required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correct: { type: Number, required: true },
  explanation: { type: String, default: "no explanation" },
});

const answerSchema = new mongoose.Schema({
  questionId: { type: Number, required: true },
  answerIndex: { type: Number, required: true },
  timeTaken: { type: Number, required: true },
  isCorrect: { type: Boolean, default: false },
});

const playerResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: { type: String, required: true },
    profilePicture: { type: String },
    score: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    answers: [answerSchema],
    abandoned: { type: Boolean, default: false },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    players: [playerResultSchema],
    theme: { type: String, required: true },
    questions: [questionSchema],
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "abandoned"],
      default: "pending",
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Méthode pour calculer les scores
matchSchema.methods.calculateScores = async function (userIdAbandonned) {
  this.players.forEach((player) => {
    player.score = 0;
    player.correctAnswers = 0;

    if (userIdAbandonned) {
      const quitter = this.players.find(
        (p) => p.userId.toString() === userIdAbandonned.toString()
      );
      const other = this.players.find(
        (p) => p.userId.toString() !== userIdAbandonned.toString()
      );

      if (quitter && other) {
        quitter.abandoned = true;
        other.score = 50;
        this.winner = other.userId;
        this.status = "abandoned";
        return;
      }
    }

    player.answers.forEach((answer) => {
      const question = this.questions.find((q) => q.id === answer.questionId);
      if (question && answer.answerIndex === question.correct) {
        answer.isCorrect = true;
        player.correctAnswers++;
        const timeBonus = Math.min(15, Math.max(0, 15 - answer.timeTaken));
        player.score += 10 + timeBonus;
      }
    });
  });

  if (this.players.length === 2 && !userIdAbandonned) {
    if (this.players[0].score > this.players[1].score) {
      this.winner = this.players[0].userId;
    } else if (this.players[1].score > this.players[0].score) {
      this.winner = this.players[1].userId;
    }
  }

  const MatchModel = mongoose.model("Match", matchSchema);
  const UserUpdater = require("../services/userUpdater.service");
  await UserUpdater.updateUsersAfterMatch(this, MatchModel);

  this.status = "completed";
  this.completedAt = new Date();
  return this;
};

module.exports = mongoose.model("Match", matchSchema);
