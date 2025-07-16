const User = require('../models/User');

class UserUpdater {
  static async updateUsersAfterMatch(match, MatchModel) {
    // console.log("Mise à jour des utilisateurs après le match:", match.id);
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

  static async handleWin(winnerId, loserId, score, MatchModel) {
    const [winner, loser] = await Promise.all([
      User.findById(winnerId),
      User.findById(loserId)
    ]);

    if (!winner || !loser) return;

    const xpGained = this.calculateXPGain(winner.level, loser.level);
    
    await User.findByIdAndUpdate(winnerId, {
      $inc: {
        experience: xpGained,
        gamesPlayed: 1,
        totalScore: score,
        currentStreak: 1
      },
      $max: { bestStreak: winner.currentStreak + 1 }
    });

    await this.checkLevelUp(winnerId);
    await this.updateWinRate(winnerId, MatchModel);
  }

  static async handleLoss(loserId, winnerId, score, MatchModel) {
    const [loser, winner] = await Promise.all([
      User.findById(loserId),
      User.findById(winnerId)
    ]);

    if (!loser || !winner) return;

    const xpLost = this.calculateXPLoss(loser.level, winner.level);
    
    await User.findByIdAndUpdate(loserId, {
      $inc: {
        experience: -xpLost,
        gamesPlayed: 1,
        totalScore: score
      },
      $set: { currentStreak: 0 }
    });

    await this.updateWinRate(loserId, MatchModel);
  }

  static async handleAbandon(quitterId, winnerId, MatchModel) {
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

  static calculateXPGain(winnerLevel, loserLevel) {
    const levelDiff = loserLevel - winnerLevel;
    return 100 + (Math.max(0, levelDiff) * 50);
  }

  static calculateXPLoss(loserLevel, winnerLevel) {
    const levelDiff = winnerLevel - loserLevel;
    return 100 + (Math.max(0, levelDiff) * 50);
  }

  static async checkLevelUp(userId) {
    const user = await User.findById(userId);
    if (!user) return;

    if (user.experience >= user.nextLevelExp) {
      const remainingXP = user.experience - user.nextLevelExp;
      
      await User.findByIdAndUpdate(userId, {
        $inc: { level: 1 },
        $set: {
          experience: remainingXP,
          nextLevelExp: 1000 + (user.level + 1) * 200
        }
      });
    }
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
