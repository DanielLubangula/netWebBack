const User = require('../models/User');

class UserUpdater {
  static async updateUsersAfterMatch(match, MatchModel) {
    if (match.players.length !== 2) return;
    const [player1, player2] = match.players;

    if (match.status === 'abandoned') {
      const quitter = player1.abandoned ? player1 : player2;
      const winner = player1.abandoned ? player2 : player1;
      await this.handleAbandon(quitter.userId, winner.userId, MatchModel);
      return;
    }

    if (player1.score > player2.score) {
      await this.handleWin(player1.userId, player2.userId, player1.score, MatchModel);
      await this.handleLoss(player2.userId, player1.userId, player2.score, MatchModel);
    } else if (player2.score > player1.score) {
      await this.handleWin(player2.userId, player1.userId, player2.score, MatchModel);
      await this.handleLoss(player1.userId, player2.userId, player1.score, MatchModel);
    }
  }

  static xpDelta(winnerLevel, loserLevel) {
    // Base 10, +5 par rang d'écart
    const diff = loserLevel - winnerLevel;
    return 10 + Math.max(0, diff) * 5;
  }

  static xpLoss(loserLevel, winnerLevel) {
    // Base 10, +5 par rang d'écart
    const diff = winnerLevel - loserLevel;
    return 10 + Math.max(0, diff) * 5;
  }

  static async handleWin(winnerId, loserId, score, MatchModel) {
    const [winner, loser] = await Promise.all([
      User.findById(winnerId),
      User.findById(loserId)
    ]);
    if (!winner || !loser) return;
    const xpGained = this.xpDelta(winner.level, loser.level);
    let newXP = (winner.experience ?? 50) + xpGained;
    let newLevel = winner.level;
    // Level up si XP >= 100
    if (newXP >= 100) {
      newLevel += 1;
      newXP = 50; // XP par défaut après up
    }
    await User.findByIdAndUpdate(winnerId, {
      $set: {
        experience: newXP,
        level: newLevel,
        currentStreak: (winner.currentStreak || 0) + 1,
        bestStreak: Math.max((winner.bestStreak || 0), (winner.currentStreak || 0) + 1),
      },
      $inc: {
        gamesPlayed: 1,
        totalScore: score
      }
    });
    await this.updateWinRate(winnerId, MatchModel);
  }

  static async handleLoss(loserId, winnerId, score, MatchModel) {
    const [loser, winner] = await Promise.all([
      User.findById(loserId),
      User.findById(winnerId)
    ]);
    if (!loser || !winner) return;
    const xpLost = this.xpLoss(loser.level, winner.level);
    let newXP = (loser.experience ?? 50) - xpLost;
    let newLevel = loser.level;
    // Si XP < 0, régression de niveau
    if (newXP < 0) {
      if (newLevel > 1) {
        newLevel -= 1;
        newXP = 50; // XP par défaut après régression
      } else {
        newXP = Math.max(newXP, -100); // XP négatif mais niveau 1
      }
    }
    await User.findByIdAndUpdate(loserId, {
      $set: {
        experience: newXP,
        level: newLevel,
        currentStreak: 0
      },
      $inc: {
        gamesPlayed: 1,
        totalScore: score
      }
    });
    await this.updateWinRate(loserId, MatchModel);
  }

  static async handleAbandon(quitterId, winnerId, MatchModel) {
    // On ne modifie pas l'XP/level sur abandon, juste les parties jouées et streaks
    await User.findByIdAndUpdate(quitterId, {
      $inc: { gamesPlayed: 1 },
      $set: { currentStreak: 0 }
    });
    await User.findByIdAndUpdate(winnerId, {
      $inc: {
        gamesPlayed: 1,
        currentStreak: 1,
        totalScore: 50
      },
      $max: { bestStreak: 1 }
    });
    await this.updateWinRate(quitterId, MatchModel);
    await this.updateWinRate(winnerId, MatchModel);
  }

  static async updateWinRate(userId, MatchModel) {
    const user = await User.findById(userId);
    if (!user) return;
    const matches = await MatchModel.countDocuments({
      'players.userId': userId,
      status: { $in: ['completed', 'abandoned'] }
    });
    const wins = await MatchModel.countDocuments({
      winner: userId,
      status: { $in: ['completed', 'abandoned'] }
    });
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    await User.findByIdAndUpdate(userId, { $set: { winRate } });
  }
}

module.exports = UserUpdater;
