const { Deck } = require('./Deck');
const { evaluateBestHand, compareHands } = require('./HandEvaluator');

const PHASES = ['waiting', 'pre-flop', 'flop', 'turn', 'river', 'showdown'];

class PokerGame {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.players = [];
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = 0;
    this.dealerIndex = -1;
    this.currentPlayerId = null;
    this.phase = 'waiting';
    this.smallBlind = options.smallBlind || 10;
    this.bigBlind = options.bigBlind || 20;
    this.actionsNeeded = new Set();
    this.lastAction = null;
    this.winners = null;
    this.handEndedByFold = false;
    this.startingChips = options.startingChips || 1500;
  }

  addPlayer(id, name, avatarId = 'alfie') {
    if (this.players.find(p => p.id === id)) return;
    if (this.players.length >= 9) throw new Error('Table is full');
    this.players.push({
      id,
      name,
      avatarId,
      chips: this.startingChips,
      holeCards: [],
      roundBet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      isActive: true,
    });
  }

  removePlayer(id) {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    if (this.phase !== 'waiting') {
      this.players[idx].folded = true;
      this.players[idx].isActive = false;
      if (this.currentPlayerId === id) {
        this._advanceCurrentPlayer();
        if (this._isRoundOver()) this._advancePhase();
      }
    } else {
      this.players.splice(idx, 1);
    }
  }

  getActivePlayers() {
    return this.players.filter(p => p.isActive && !p.folded);
  }

  canStart() {
    return this.players.filter(p => p.isActive).length >= 2;
  }

  startHand() {
    if (!this.canStart()) throw new Error('Need at least 2 players');

    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.winners = null;
    this.lastAction = null;
    this.handEndedByFold = false;

    for (const p of this.players) {
      p.holeCards = [];
      p.roundBet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allIn = false;
      p.isActive = p.chips > 0;
    }

    const active = this.players.filter(p => p.isActive);
    if (active.length < 2) throw new Error('Not enough chips to continue');

    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    while (!this.players[this.dealerIndex].isActive) {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    for (const p of active) {
      p.holeCards = [this.deck.deal(), this.deck.deal()];
    }

    this._startPreFlop();
  }

  _startPreFlop() {
    this.phase = 'pre-flop';
    const active = this.players.filter(p => p.isActive);
    const count = active.length;

    let sbIdx, bbIdx;
    if (count === 2) {
      sbIdx = this.dealerIndex;
      bbIdx = this._nextActiveIndex(this.dealerIndex);
    } else {
      sbIdx = this._nextActiveIndex(this.dealerIndex);
      bbIdx = this._nextActiveIndex(sbIdx);
    }

    this._postBlind(this.players[sbIdx].id, this.smallBlind);
    this._postBlind(this.players[bbIdx].id, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    this.actionsNeeded = new Set(active.map(p => p.id));

    const utgIdx = count === 2 ? sbIdx : this._nextActiveIndex(bbIdx);
    this.currentPlayerId = this.players[utgIdx].id;
  }

  _postBlind(playerId, amount) {
    const player = this.players.find(p => p.id === playerId);
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.roundBet += actual;
    player.totalBet += actual;
    this.pot += actual;
    if (player.chips === 0) player.allIn = true;
  }

  _nextActiveIndex(fromIndex) {
    let idx = (fromIndex + 1) % this.players.length;
    while (!this.players[idx].isActive) {
      idx = (idx + 1) % this.players.length;
    }
    return idx;
  }

  _nextNeedToActIndex(fromIndex) {
    let idx = (fromIndex + 1) % this.players.length;
    const start = idx;
    do {
      const p = this.players[idx];
      if (!p.folded && !p.allIn && p.isActive && this.actionsNeeded.has(p.id)) {
        return idx;
      }
      idx = (idx + 1) % this.players.length;
    } while (idx !== start);

    idx = start;
    do {
      const p = this.players[idx];
      if (!p.folded && !p.allIn && p.isActive && this.actionsNeeded.has(p.id)) {
        return idx;
      }
      idx = (idx + 1) % this.players.length;
    } while (idx !== (fromIndex + 1) % this.players.length);

    return -1;
  }

  handleAction(playerId, action, amount) {
    if (this.currentPlayerId !== playerId) throw new Error('Not your turn');
    if (!['fold', 'check', 'call', 'raise', 'all-in'].includes(action)) throw new Error('Invalid action');

    const player = this.players.find(p => p.id === playerId);
    const currentIdx = this.players.indexOf(player);

    if (action === 'fold') {
      player.folded = true;
      this.actionsNeeded.delete(playerId);
      this.lastAction = { playerId, action: 'fold', name: player.name, t: Date.now() };

    } else if (action === 'check') {
      if (player.roundBet < this.currentBet) throw new Error('Cannot check, must call or raise');
      this.actionsNeeded.delete(playerId);
      this.lastAction = { playerId, action: 'check', name: player.name, t: Date.now() };

    } else if (action === 'call') {
      const callAmt = Math.min(this.currentBet - player.roundBet, player.chips);
      player.chips -= callAmt;
      player.roundBet += callAmt;
      player.totalBet += callAmt;
      this.pot += callAmt;
      if (player.chips === 0) {
        player.allIn = true;
      }
      this.actionsNeeded.delete(playerId);
      this.lastAction = { playerId, action: 'call', amount: callAmt, name: player.name, t: Date.now() };

    } else if (action === 'raise' || action === 'all-in') {
      const wasOpening = this.currentBet === 0;
      const totalBet = action === 'all-in' ? player.roundBet + player.chips : amount;
      if (totalBet < this.currentBet + this.minRaise && player.chips > 0) {
        throw new Error(`Minimum raise is to ${this.currentBet + this.minRaise}`);
      }
      const raiseAmt = Math.min(totalBet - player.roundBet, player.chips);
      const actualTotal = player.roundBet + raiseAmt;

      this.minRaise = Math.max(this.minRaise, actualTotal - this.currentBet);
      this.currentBet = Math.max(this.currentBet, actualTotal);

      player.chips -= raiseAmt;
      player.roundBet = actualTotal;
      player.totalBet += raiseAmt;
      this.pot += raiseAmt;
      if (player.chips === 0) player.allIn = true;

      for (const p of this.getActivePlayers()) {
        if (p.id !== playerId && !p.allIn) {
          this.actionsNeeded.add(p.id);
        }
      }
      this.actionsNeeded.delete(playerId);
      const actionLabel = player.allIn ? 'all-in' : (wasOpening ? 'bet' : 'raise');
      this.lastAction = { playerId, action: actionLabel, amount: actualTotal, name: player.name, t: Date.now() };
    }

    if (this._isRoundOver()) {
      this._advancePhase();
      return;
    }

    this._advanceCurrentPlayer();
  }

  _isRoundOver() {
    const nonFolded = this.players.filter(p => p.isActive && !p.folded);
    if (nonFolded.length <= 1) return true;

    const needToAct = [...this.actionsNeeded].filter(id => {
      const p = this.players.find(pl => pl.id === id);
      return p && !p.folded && !p.allIn && p.isActive;
    });
    return needToAct.length === 0;
  }

  _advanceCurrentPlayer() {
    const currentIdx = this.players.findIndex(p => p.id === this.currentPlayerId);
    const nextIdx = this._nextNeedToActIndex(currentIdx);
    if (nextIdx === -1) {
      this._advancePhase();
    } else {
      this.currentPlayerId = this.players[nextIdx].id;
    }
  }

  _advancePhase() {
    this._collectBets();

    const nonFolded = this.players.filter(p => p.isActive && !p.folded);

    if (nonFolded.length === 1) {
      this._awardToLastPlayer(nonFolded[0]);
      return;
    }

    const allDone = nonFolded.every(p => p.allIn);

    switch (this.phase) {
      case 'pre-flop':
        this.phase = 'flop';
        this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
        break;
      case 'flop':
        this.phase = 'turn';
        this.communityCards.push(this.deck.deal());
        break;
      case 'turn':
        this.phase = 'river';
        this.communityCards.push(this.deck.deal());
        break;
      case 'river':
        this._showdown();
        return;
    }

    // No more meaningful betting once 0 or 1 non-all-in players remain.
    // (In heads-up, one all-in + the other calling already means no further
    //  action is possible — deal all remaining streets and go to showdown.)
    if (allDone || nonFolded.filter(p => !p.allIn).length <= 1) {
      if (this.phase !== 'showdown' && this.communityCards.length < 5) {
        while (this.communityCards.length < 5) {
          this.communityCards.push(this.deck.deal());
        }
      }
      this._showdown();
      return;
    }

    this._startBettingRound();
  }

  _collectBets() {
    for (const p of this.players) {
      p.roundBet = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
  }

  _startBettingRound() {
    this.actionsNeeded = new Set();
    for (const p of this.getActivePlayers()) {
      if (!p.allIn) this.actionsNeeded.add(p.id);
    }

    const firstIdx = this._nextActiveIndex(this.dealerIndex);
    let checkIdx = firstIdx;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[checkIdx];
      if (!p.folded && !p.allIn && p.isActive) {
        this.currentPlayerId = p.id;
        return;
      }
      checkIdx = (checkIdx + 1) % this.players.length;
    }
  }

  _calculateSidePots() {
    const contributors = this.players.filter(p => p.isActive && p.totalBet > 0);
    const pots = [];
    const remaining = contributors.map(p => ({
      id: p.id,
      amount: p.totalBet,
      folded: p.folded,
    }));

    while (remaining.some(r => r.amount > 0)) {
      const minBet = Math.min(...remaining.filter(r => r.amount > 0).map(r => r.amount));
      let potAmount = 0;
      const eligible = [];

      for (const r of remaining) {
        const contribution = Math.min(r.amount, minBet);
        potAmount += contribution;
        r.amount -= contribution;
        if (!r.folded && contribution > 0) eligible.push(r.id);
      }

      if (potAmount > 0) pots.push({ amount: potAmount, eligible });
    }

    return pots;
  }

  _showdown() {
    this.phase = 'showdown';
    this.currentPlayerId = null;

    const pots = this._calculateSidePots();
    this.winners = [];

    for (const pot of pots) {
      const eligible = this.players.filter(p => pot.eligible.includes(p.id) && !p.folded);
      if (eligible.length === 0) continue;

      const evaluated = eligible.map(p => ({
        player: p,
        hand: evaluateBestHand([...p.holeCards, ...this.communityCards]),
      }));

      evaluated.sort((a, b) => compareHands(b.hand, a.hand));
      const best = evaluated[0].hand;
      const winners = evaluated.filter(e => compareHands(e.hand, best) === 0);

      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;

      winners.forEach((w, i) => {
        w.player.chips += share + (i === 0 ? remainder : 0);
        this.winners.push({
          playerId: w.player.id,
          playerName: w.player.name,
          handName: w.hand.name,
          amount: share + (i === 0 ? remainder : 0),
          holeCards: w.player.holeCards,
        });
      });
    }

    this.pot = 0;
  }

  _awardToLastPlayer(player) {
    this.phase = 'showdown';
    this.handEndedByFold = true;
    this.currentPlayerId = null;
    player.chips += this.pot;
    this.winners = [{
      playerId: player.id,
      playerName: player.name,
      handName: 'Winner',
      amount: this.pot,
      holeCards: player.holeCards,
    }];
    this.pot = 0;
  }

  getDealerIndex() {
    return this.dealerIndex;
  }

  getStateFor(requestingPlayerId) {
    const activeCount = this.players.filter(p => p.isActive).length;
    let sbIdx, bbIdx;
    if (activeCount === 2) {
      sbIdx = this.dealerIndex;
      bbIdx = this._nextActiveIndex(this.dealerIndex);
    } else {
      sbIdx = this._nextActiveIndex(this.dealerIndex);
      bbIdx = this._nextActiveIndex(sbIdx);
    }
    const sbId = this.players[sbIdx]?.id;
    const bbId = this.players[bbIdx]?.id;

    return {
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      currentPlayerId: this.currentPlayerId,
      lastAction: this.lastAction,
      winners: this.winners,
      dealerId: this.players[this.dealerIndex]?.id,
      smallBlindId: sbId,
      bigBlindId: bbId,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      players: this.players.map(p => {
        const isOwn = p.id === requestingPlayerId;
        // Hide opponents' hole cards unless we reached a true showdown (river call or all-in to the end).
        // A fold-out (this.handEndedByFold) sets phase to 'showdown' too but the winner shouldn't reveal.
        const showCards = isOwn || (this.phase === 'showdown' && !this.handEndedByFold && !p.folded);
        return {
          id: p.id,
          name: p.name,
          avatarId: p.avatarId,
          chips: p.chips,
          roundBet: p.roundBet,
          folded: p.folded,
          allIn: p.allIn,
          isActive: p.isActive,
          isDealer: p.id === this.players[this.dealerIndex]?.id,
          isSmallBlind: p.id === sbId,
          isBigBlind: p.id === bbId,
          holeCards: showCards ? p.holeCards : (p.holeCards.length > 0 ? [{ hidden: true }, { hidden: true }] : []),
          isCurrentPlayer: p.id === this.currentPlayerId,
        };
      }),
    };
  }
}

module.exports = { PokerGame };
