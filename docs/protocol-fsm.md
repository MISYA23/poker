# Client/Server FSM Protocol Contract

**Status:** draft · **Branch:** `client-server-fsm` · **Owner:** Brian

This is the spec the server game FSM and the client presentation FSM both agree on.
Write it down *before* implementing either side. No implementation here — shapes,
states, transitions, and rules only.

---

## 0. Implementation status (branch `client-server-fsm`)

**Built and verified** (server side proven by `server/scripts/fsm-integration-test.js`,
6/6 checks; client verified by Babel parse only — NOT yet device-tested):

- **Phase 1** — deleted the dead DB `ui_config` pipeline; `timings.js` is the sole
  presentation-timing source.
- **2a** — every snapshot carries `seq` (already existed) + derived `lifecycle`
  (`lifecycleOf(m)`), on all three emit paths.
- **2b** — `INTER_HAND` is a real (transient) state: `enterInterHand`/`exitInterHand`,
  bust handled on the named `INTER_HAND → MATCH_OVER` edge, `hand-end-ready` ack deals
  the next hand early (measured ~100ms vs the 5s clamp). Idempotent.
- **2c** — turn clock is ack-gated: `startTurnTimer` arms a settle clamp
  (`TURN_SETTLE_CLAMP_MS = 10000`) and `deadline = null`; `startTurnClock` starts the
  real N-second forfeit clock on the actor's `action-ready` ack (measured ~1ms) or the
  clamp, whichever first. Bots stay clockless.
- **Client acks** — `onHandEndAnimDone` emits `hand-end-ready`; a `canAct`
  (`isMyTurn && !fullDealerAnimating`) effect emits `action-ready`. Both idempotent
  server-side.
- **Phase 5** — removed dead `autoStartTimer`, `botTimer`, `auto_start_delay_ms`,
  `DEAL_LOCK_MS`, `STREET_DEAL_MAX_MS`.

**Deferred (pragmatic deviations from the full spec below):**

- The client did **not** get a ground-up `ClientMode` rewrite (§6). The existing
  buffering (`handEndLockRef`) + `isMyTurn`-derived `canAct` already implement the
  observable contract (delay-don't-invent, input gating); the formal mode enum is a
  future refactor. The acks + ack-gated clock — the actual payoff — are live.
- `seq` is **not** yet used for client-side stale-drop, and `player-action` does **not**
  yet carry `seq` (§4, §8). Server still trusts `currentPlayerId`. Low risk; add when the
  formal client FSM lands.
- Disconnect/abandon policy unchanged (only the turn clock forfeits) — see §10.1.
- `INTER_HAND` force-deal uses the `nextHandTimer` field as its clamp; no separate
  `interHandForceDealMs` config knob was added (clamp = `inter_hand_delay_ms`).

---

## 1. Principles

1. **The server owns truth. The client owns presentation.** The server decides what
   is legally happening; the client decides what the user currently sees.
2. **The client may delay display, but never invent truth.** Display can lag the
   server; it can never lead it or fabricate a state the server hasn't sent.
3. **One source per value, on the side that enforces it.** Presentation timings live
   in `client/src/timings.js`. Game-rule durations (`turn_seconds`,
   `inter_hand_delay_ms`) live server-side and are *stamped into snapshots* so the
   client reads them rather than hardcoding.
4. **Every transition is named and enumerated.** A timer firing or a ref being
   non-null is not a state. If it gates behavior, it is a named state with explicit
   entry and exit edges.

---

## 2. The two FSMs

| | Server game FSM | Client presentation FSM |
|---|---|---|
| Answers | "What is legally happening?" | "What is the user currently seeing?" |
| Authoritative | yes | no |
| Carries | handId, phase, pot, stacks, board, turn, deadlines, seq | rendered snapshot, animation queue, pending snapshot, mode |
| Source of timing | game-rule durations | `timings.js` |

They are coupled only through the **wire contract** (sections 4–7). Neither reaches
into the other's state.

A legal, expected divergence:

```
Server: WAITING_FOR_ACTION, hand 12, seq 87
Client: still ANIMATING_EVENTS from hand 11, rendered seq 81
```

This is fine. The client knows it is behind and must not let the user act
(section 6, `canAct`).

---

## 3. Server game FSM

States (the implicit ones today — "is a nextHandTimer pending?" — become explicit):

```
HAND_IN_PROGRESS
  └─ WAITING_FOR_ACTION   actor on the clock
  └─ STREET_COMPLETE      bets collected, advancing board
SHOWDOWN                  hand decided, result known
INTER_HAND                between hands; min-dwell = inter_hand_delay_ms
MATCH_OVER                a player is bust or forfeited
```

Transitions (each is a named edge, not a side effect buried in a `setTimeout`):

```
WAITING_FOR_ACTION ──action / timeout──▶ WAITING_FOR_ACTION   (next actor)
WAITING_FOR_ACTION ──street closes─────▶ STREET_COMPLETE
STREET_COMPLETE    ──board dealt───────▶ WAITING_FOR_ACTION
WAITING_FOR_ACTION ──hand resolves─────▶ SHOWDOWN
SHOWDOWN           ──enter────────────▶ INTER_HAND
INTER_HAND         ──hand-end-ready ack (or force-deal clamp) + both stacks > 0──▶ HAND_IN_PROGRESS (deal next)
INTER_HAND         ──hand-end-ready ack (or force-deal clamp) + a stack == 0─────▶ MATCH_OVER
WAITING_FOR_ACTION ──turn clock expires──────────▶ MATCH_OVER (forfeit)
any                ──disconnect/abandon rules────▶ (TBD, section 10)
```

Notes:
- **`INTER_HAND` replaces the bare `nextHandTimer`.** `inter_hand_delay_ms` does **not**
  survive — not as a free timer and not relocated onto the state as a tuned dwell.
  Between-hand pacing is now entirely client-side presentation (`timings.js`), masked by
  buffering; the action clock is ack-gated (§7). `INTER_HAND` is a *transient* state, not
  a timed one. The server deals the next hand on a `hand-end-ready` ack from the client,
  clamped by an optional **force-deal ceiling** (`interHandForceDealMs`) so a stalled
  client can't hang the match. That ceiling is a safety value, not a pacing target.
- **Bust detection moves out of the timer callback** into the named
  `INTER_HAND → MATCH_OVER` edge.
- Forfeit is the `WAITING_FOR_ACTION → MATCH_OVER` edge fired by clock expiry.
  This is the *only* path that forfeits a player. Disconnection alone does not
  (until section 10 says otherwise).

---

## 4. Snapshot contract

Every server→client state push is a **snapshot**: the complete truth at one instant.

```
Snapshot {
  seq:           monotonic uint, increments on every snapshot (NOT per hand)
  handId:        uint, the current hand
  phase:         one of the server FSM states (section 3)
  board:         card[]            // community cards legally dealt
  pot:           uint
  players: [{ seat, playerId, stack, committed, holeCards|null, isActive, allIn }]
  toActSeat:     seat | null       // who is on the clock, null if nobody
  turn: {                          // present iff toActSeat != null AND clock is running
    durationMs:  uint              // = turn_seconds * 1000, stamped by server
    deadline:    epochMs | null    // absolute server time; null until action-ready (section 7)
  }
}
```

Rules:
- **`seq` is the ordering authority.** A snapshot with `seq <= rendered.seq` is stale
  and dropped. `handId` is NOT sufficient — a hand has many snapshots.
- **`deadline` is absolute server epoch time**, never a relative duration. The client
  renders countdown = `deadline - now`. Server and client clocks are assumed close;
  the deadline is advisory for display — the server's own timer is the enforcer.
- **`deadline` is `null` until the actor is action-ready** (section 7). A null
  deadline means "the clock has not started yet" — the client shows no countdown.

---

## 5. Events vs. snapshots

Two channels, different jobs:

- **Snapshot** = truth (section 4). Always wins.
- **Event** = a presentation *hint* describing a discrete thing that happened
  (card dealt, bet placed, pot pushed) so the client can animate the *transition*
  into the next snapshot instead of cutting to it.

**Reconciliation invariant:**

> Replaying the event queue from `rendered` MUST land exactly on the target
> snapshot. If it does not, the snapshot wins and the client **snaps** (section 6,
> `SNAP_RENDER`). Events never override truth; on any conflict, snap.

This makes drift between "what I animated" and "what is true" impossible to hide —
it surfaces as a deliberate snap, not a silent desync.

---

## 6. Client presentation FSM

State carried by the client:

```
{
  authoritativeSnapshot,   // latest truth from server (highest seq seen)
  renderedSnapshot,        // what is currently on screen
  eventQueue,              // events bridging rendered → a target snapshot
  pendingSnapshot,         // newer truth arrived mid-animation, held
  mode,                    // ClientMode
  animatingSeq,            // the snapshot seq the current animation targets
}
```

Modes:

```
SYNCED                    rendered == authoritative; idle; user may act
ANIMATING_EVENTS          playing eventQueue toward animatingSeq
BUFFERING_SERVER_STATE    animating, but a newer snapshot is held in pendingSnapshot
CATCHING_UP               draining a backlog (multiple pending) toward latest
SNAP_RENDER               jump straight to authoritative, no animation
```

> Collapse rule: if two modes never differ in *what is rendered* AND *whether the
> user can act*, merge them. Candidates to watch: `BUFFERING_SERVER_STATE` vs
> `CATCHING_UP`. Keep them separate only if their exit policy differs (animate the
> pending events vs. snap past them).

Mode flow:

```
snapshot arrives
  ├─ no animation needed         → render immediately, mode = SYNCED
  ├─ animation needed            → queue events, mode = ANIMATING_EVENTS,
  │                                play, then reconcile, mode = SYNCED
  └─ newer snapshot mid-animation→ store as pendingSnapshot, mode = BUFFERING_SERVER_STATE,
                                   finish current sequence, then either
                                   animate pending events OR SNAP_RENDER to latest

reconnect / cold start           → SNAP_RENDER to authoritative, then SYNCED
                                   (never animate a hand whose start was not seen)
```

**Snap policy** (what `SNAP_RENDER` may skip vs. must show):
- May snap freely *through* intermediate action/board states.
- MUST show terminal/reveal states the user is entitled to: showdown card reveal,
  hand winner, match-over. Snapping past these silently swallows truth the user
  needed — forbidden. If a reveal must be dropped for catch-up, it is an explicit,
  logged decision, not an accident.

**The input guard** (prevents the whole class of timing bugs):

```
canAct =
  mode === 'SYNCED' &&
  authoritativeSnapshot.phase === 'WAITING_FOR_ACTION' &&
  authoritativeSnapshot.toActSeat === mySeat
```

---

## 7. Action-clock sync — the crux

**Problem.** The N-second turn clock must start when the actor's client is *actually
ready to act* — cards dealt, board revealed, all hand-end + deal animation drained —
not when the server logically enters `WAITING_FOR_ACTION`. The pre-action animation
duration varies by how the previous hand ended (fold = short; all-in runout = long)
plus the `INTER_HAND` dwell plus deal animation. Start the clock too early and a
player can be forfeited while still watching the previous hand's animation.

**Mechanism (ack + server clamp):**

1. Server enters `WAITING_FOR_ACTION` for `toActSeat` at snapshot `seq`, with
   `turn.deadline = null` (clock not started).
2. The actor's client reaches `SYNCED` at that `seq` and emits:
   ```
   action-ready { matchId, seq }
   ```
3. Server starts the clock on receipt:
   ```
   deadline = now + turn.durationMs
   ```
   and broadcasts a fresh snapshot carrying that `deadline` (so BOTH players see the
   same absolute countdown).
4. **Server clamp.** The server independently computes a max settle budget and starts
   the clock no later than `dealTime + maxSettleBudget`, regardless of whether the ack
   arrived. A stalling or malicious client cannot postpone its clock forever.

```
maxSettleBudget = worst-case residual hand-end reveal for this hand-end type
                  (fold → short, showdown / all-in runout → long)
                + deal animation budget
```

Note there is **no `INTER_HAND` dwell term** — `INTER_HAND` is transient (§3). If the
server deals the next hand the instant it gets `hand-end-ready`, the client may still be
finishing the previous hand's reveal, which is exactly the residual-reveal term above.

The budget is derived from the **same** consolidated constants the client animates
with (`timings.js` mirror of game-rule durations stamped in the snapshot). This is
the concrete reason Phase 1 (single timing source) had to land first: both sides must
compute the same budget or the clamp fights the animation.

**Scope.** This applies to *every* decision point, not just hand start — including
street-to-street board reveals, where the next actor's clock must not run during the
flop/turn/river reveal animation. Hand start after an all-in is the worst case.

**Honest-client guarantee.** A client that acks promptly gets a full N seconds from
the moment it can actually act. The clamp only bites clients that don't ack in time.

---

## 8. Message catalog

Client → Server:
```
player-action     { matchId, action, amount, seq }   // seq = snapshot the action responds to
action-ready      { matchId, seq }                    // NEW: actor is SYNCED, start my clock
hand-end-ready    { matchId, seq }                    // NEW: hand-end animation done, ok to deal next
bot-action-request{ matchId }                          // unchanged
observe/unobserve { matchId }                          // unchanged
```
- `player-action` carries `seq` so the server can reject actions aimed at a stale
  snapshot (double-tap, action after the state already moved).

Server → Client:
```
snapshot          Snapshot (section 4)                 // replaces ad hoc game-state pushes
events            { seq, events: Event[] }             // presentation hints (section 5)
match-over        { ... }                              // unchanged shape, gated by snap policy
```

---

## 9. Migration map (old ad hoc → new)

| Today | Becomes |
|---|---|
| `nextHandTimer` pending = "between hands" | explicit (transient) `INTER_HAND` state |
| `inter_hand_delay_ms` delay | **retired** — pacing → `timings.js`, deal → `hand-end-ready` ack + optional `interHandForceDealMs` clamp |
| bust check inside next-hand `setTimeout` | named `INTER_HAND → MATCH_OVER` edge |
| `m.turnDeadline` set at turn start | `deadline = null` until `action-ready` / clamp |
| client `handEndLockRef` + `HAND_END_MAX_MS` | `BUFFERING_SERVER_STATE` + snap policy |
| `handEventsRef` buffering | `eventQueue` + reconciliation invariant |
| "is it my turn?" scattered checks | single `canAct` guard |
| DB `ui_config` (deleted in Phase 1) | `timings.js` |
| dead `autoStartTimer`, `botTimer`, `auto_start_delay_ms` | removed (Phase 5) |

---

## 10. Open decisions

1. **Disconnect/abandon policy.** ✅ DECIDED (deferred): no disconnect handling for
   now. The **only** way to forfeit is the turn clock expiring. Disconnect-aware
   abandon timers / grace windows are a later phase.
2. **Mode collapse.** Confirm whether `BUFFERING_SERVER_STATE` and `CATCHING_UP` are
   behaviorally distinct (section 6) or merge.
3. **Clock skew.** `deadline` assumes client/server clocks are close. If skew is a
   problem on real devices, send `serverNow` alongside `deadline` and have the client
   compute an offset once per session.
4. **Bot matches.** ✅ DECIDED: bots stay **clockless** for now (`startTurnTimer`
   continues to return early for bot matches; no `action-ready`/clamp path for bots).
5. **Game-rule timing home.** `turn_seconds` stays in `game_config`
   (server-authoritative) and is stamped into snapshots. Confirm we are NOT moving it
   into `timings.js` (a client file can't enforce a server rule). `inter_hand_delay_ms`
   is **retired** (§3).
6. **`INTER_HAND` exit.** Recommended: ack-driven (`hand-end-ready`) + optional
   `interHandForceDealMs` safety clamp, symmetric with `action-ready`. Alternative: keep
   a small fixed floor. Either way `inter_hand_delay_ms` as a tuned pacing value is gone.
   Decide whether the force-deal clamp is even needed or if the existing match
   `cleanupTimer` already covers the stalled-client case.
```

---

## 11. Next: the MATCH-level FSM (handoff for the next session)

`lifecycle` (§3) models only the **in-hand loop inside a live match**. There is a
second, *outer* FSM — the match/session lifecycle — that is currently **implicit**
(scattered across socket events + flags) and not surfaced anywhere. This is the same
"make the implicit explicit" move as `INTER_HAND`, one level up.

```
MATCH / SESSION FSM  (outer — NOT modeled yet)
  AWAITING_READY    match-found → pre-match "Match Starting" countdown → waiting for match-ready
  IN_MATCH ─────────┐  the inner hand FSM (§3) runs entirely inside this state
  MATCH_OVER        │
  REMATCH_PENDING   │  rematch offered; votes accumulating
  (exits to lobby, or rematch → AWAITING_READY/IN_MATCH)
```

Where each state is tracked **today** (server `index.js`):
- AWAITING_READY — `m.game.phase === 'waiting'` before the first hand + `m.readySafetyTimer`
  (15s safety) armed by `scheduleReadyStart`; client shows `PreMatchCountdown` (10s ELO
  animation in `MatchFlowOverlays.jsx`) and emits `match-ready`.
- IN_MATCH — a hand has begun; the §3 lifecycle applies.
- MATCH_OVER — `m.ended === true`, `m.game.gameOver === true`; delivered to the client via
  a **separate `match-over` socket event**, NOT a game-state snapshot.
- REMATCH_PENDING — `m.rematchVotes` set; `m.cleanupTimer` (90s) reaps if nobody rematches;
  `rematch-vote` → `resetRoom` → back to AWAITING_READY/IN_MATCH.

### Two quirks the next session must know (discovered live, not obvious from code)

1. **The debug panel freezes at `SHOWDOWN`/`FOLD` on the match-over screen.** On a bust,
   `exitInterHand` deliberately **skips `broadcastMatchState`** ("stay in showdown until
   match-over fires") and the match end arrives via the out-of-band `match-over` event. So
   the client's last *game-state* is the hand-end snapshot — `gameState.lifecycle` never
   advances to `MATCH_OVER`, and `seq`/`deadline`/`toAct` read empty on that held snapshot.
2. **`INTER_HAND` is never broadcast to the client.** `enterInterHand` sets
   `awaitingDeal=true` but does not broadcast; `exitInterHand` clears it *before* the
   next-hand broadcast. So `lifecycle === 'INTER_HAND'` is only ever observable
   server-side / pre-first-hand. The client's "between hands" period is the held
   `FOLD`/`SHOWDOWN` snapshot during its hand-end animation.

### Suggested implementation
- Add a sibling **`matchState`** field (don't overload `lifecycle`): derive it like
  `lifecycleOf`, and **stamp it onto the `match-over` and rematch transitions** so the
  client actually receives `MATCH_OVER`/`REMATCH_PENDING` (the fix for quirk #1).
- Add a `MATCH` section to the dev debug panel (`GameScreen.jsx`, next to the SERVER/CLIENT
  blocks) showing `matchState` + client-side `matchOver`/rematch flags.
- Decide whether the pre-match `PreMatchCountdown` and `match-ready` ack should fold into
  this FSM (symmetry with `action-ready`/`hand-end-ready`) or stay as-is.

Verify with `server/scripts/fsm-integration-test.js` (extend it to play a hand to bust and
assert the client receives `matchState: MATCH_OVER`).
