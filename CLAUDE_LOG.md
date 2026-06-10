# Poker — Claude Session Log

Each Claude session must read `tail -80 CLAUDE_LOG.md` before starting work,
and log [START] / [DONE] entries for every task. See global CLAUDE.md for protocol.

**Log entry rules:**
- [DONE] entries must list every file changed, not just the headline task
- Format: `[DONE] task description — changed: file1.js, file2.jsx`
- If multiple files changed, name all of them — another session must be able to know exactly what was touched without reading git history

---

[22:07 UTC] [DONE] Created CLAUDE_LOG.md — multi-session coordination enabled
[22:10 UTC] [DONE] Merged sessions — resolved duplicate /health route; all changes from both sessions intact
[22:20 UTC] [DONE] v4.8 — proxy Google web token exchange through server; GOOGLE_CLIENT_SECRET set in Railway + server/.env
[02:07 UTC] [DONE] added withNoRequiredFeatures config plugin — changed: client/app.json, client/plugins/withNoRequiredFeatures.js, client/src/config.js
[03:20 UTC] [DONE] added /admin/players sortable players table — changed: server/index.js, client/src/config.js
[18:26 UTC] [START] Rename Recent tab → Players tab with online/in-match status dots
[20:03 UTC] [DONE] v5.99 (b1.46): Facebook login for web — changed: client/web/index.html (new), client/src/screens/LoginScreen.jsx, server/index.js, client/src/config.js
[20:11 UTC] [DONE] v5.100: add /terms page — changed: server/index.js, client/src/config.js
[02:59 UTC] [START] Slumbot API integration — new branch, connect to API, console.log recommended plays with gamestate
[03:03 UTC] [DONE] v5.102: Slumbot API client + test harness on branch feature/slumbot-bot — changed: server/slumbot.js (new), server/scripts/slumbotTest.js (new), client/src/config.js
[03:14 UTC] [START] Monte Carlo bot brain — equity sim + tunable personality profiles, branch feature/bot-brain
[03:17 UTC] [START] stress-testing feature/play-bot in worktree — scripted bug hunt
[03:20 UTC] [DONE] v5.103: Monte Carlo bot brain + profiles + harness on feature/bot-brain — changed: server/bot/monteCarlo.js (new), server/bot/profiles.js (new), server/bot/botBrain.js (new), server/scripts/botBrainTest.js (new), client/src/config.js
[03:23 UTC] [DONE] play-bot bug hunt — 16/18 scripted scenarios passed; 2 failures look like test-harness races (next-hand detection), no server errors logged; no code changes
[03:27 UTC] [START] merge feature/play-bot → main + wire bot brain (server/bot) into play-bot matches
[03:33 UTC] [DONE] merged feature/play-bot → main + wired bot brain into play-bot (random profile per match, check/call fallback); live-tested vs maniac profile (raises/jams/bets, 0 errors) — changed: server/index.js, client/src/config.js; pushed main (Railway deploy)
[03:36 UTC] [DONE] v5.105 deployed — play-bot + bot brain live on prod (verified match vs Monkey Bot on both domains); test rows cleaned
[03:42 UTC] [START] feature/named-bots — three always-online bots (rickdeckard/hal/johnny5) with fixed personalities
[03:49 UTC] [DONE] v5.106 deployed — named bots Rick Deckard (tag) / HAL 9000 (nit) / Johnny 5 (maniac) live, always online in lobby, players rows upserted — changed: server/index.js, client/src/config.js
[03:54 UTC] [START] Challenge system — accept buttons under PLAY BOT, challenge modal in Players tab, void-all-on-match-start — branch feature/challenges
[03:56 UTC] [START] feature/rated-bots — make bot matches ELO-rated + fix calcElo zero-sum bug (loser was charged K*E(winner))
[03:58 UTC] [DONE] v5.107 pushed to main — bot matches ELO-rated, calcElo zero-sum fix — changed: server/index.js, server/matchmaker.js, client/src/config.js (note: local main ref is stale; pushed via feature/rated-bots:main because checkout is on feature/challenges)
[04:01 UTC] [DONE] v5.107: challenge system on feature/challenges — accept buttons under PLAY BOT, challenge modal in Players tab, void-all-on-match-start/disconnect, 5min expiry; 12/12 socket tests passed — changed: server/index.js, client/App.js, client/src/screens/LobbyScreen.jsx, client/src/components/FriendsTab.jsx, server/scripts/challengeTest.js (new), client/src/config.js
[04:04 UTC] [DONE] merged feature/challenges → main + pushed (Railway deploy dc5f60c); re-ran 12/12 challenge socket tests against merged code; branch deleted
[04:07 UTC] [START] Players tab — add ELO, sort challengeable-first — branch feature/players-elo
[04:09 UTC] [DONE] v5.108: Players tab shows ELO + sorts challengeable-first; eloCache seeded at enter-lobby + bot startup — changed: server/index.js, client/src/screens/LobbyScreen.jsx, client/src/config.js
[04:09 UTC] [DONE] merged feature/players-elo → main + pushed (Railway deploy)
[04:11 UTC] [START] Players tab → Online, mid-match players not challengeable — branch feature/online-tab
[04:12 UTC] [DONE] v5.109: Players tab renamed Online; mid-match rows not tappable — changed: client/src/screens/LobbyScreen.jsx, client/src/config.js
[04:15 UTC] [START] Online tab row redesign — button styling, country flags (IP geo), ELO next to name — branch feature/online-row-buttons
[04:20 UTC] [DONE] v5.110: Online tab rows as buttons w/ country flags (IP geo, players.country col added) + challenge UX — modal auto-close, outgoing pending button w/ withdraw, reworded accept; 14/14 socket tests — changed: server/index.js, client/App.js, client/src/screens/LobbyScreen.jsx, server/scripts/challengeTest.js, client/src/config.js
[04:24 UTC] [START] Challengeable bots — tap bot in Online tab starts instant match vs that bot — branch feature/challenge-bots
[04:38 UTC] [DONE] v5.111: challengeable bots (tap bot → instant match) + match-end bug fixes — rematch-vote gameOver gate, zombie nextHandTimer, clearStaleMatch self-heal, redis fail-fast; 30/30 socket tests + local expo export OK — changed: server/index.js, server/redis.js, client/src/screens/LobbyScreen.jsx, server/scripts/botChallengeTest.js (new), client/src/config.js
[04:43 UTC] [DONE] v5.111 deployed + verified on prod — 16/16 bot challenge tests against live server
[04:43 UTC] [START] match lifecycle redesign — lobby XOR table invariant, no disconnect grace, single close path, remove defensive hacks — branch feature/match-lifecycle
[04:53 UTC] [DONE] v5.112: match lifecycle redesign — liveMatchOf single source of truth, no disconnect grace (instant forfeit), enter-lobby forfeits live match (lobby XOR table), removed pendingDisconnects/clearStaleMatch/DisconnectBanner, refresh-profile event; 43/43 tests (3 suites) — changed: server/index.js, client/App.js, client/src/screens/GameScreen.jsx, client/src/screens/LobbyScreen.jsx, server/scripts/matchLifecycleTest.js (new), client/src/config.js
[04:58 UTC] [DONE] v5.112 deployed + verified on prod — 43/43 across matchLifecycleTest/challengeTest/botChallengeTest
[04:58 UTC] [RUNNING] EAS Android production build versionCode 7 — https://expo.dev/accounts/coinburst/projects/poker-monkey/builds/15ee274c-1a2c-4962-a0bb-717194562b66
[13:52 UTC] [START] seat-level disconnect grace — vacancy on match object, enter-lobby rejoin priority, grace timer in endMatch — branch feature/disconnect-grace
[13:56 UTC] [START] match format — escalating blinds every N hands + admin Match Format config section — branch feature/match-format (worktree)
[14:00 UTC] [DONE] v5.113: seat-level disconnect grace (20s, DISCONNECT_GRACE_MS/cfg override) — vacancy on match object, enter-lobby rejoin priority, graceTimer reaped by endMatch, logout forfeits, banner restored; 42/42 local tests — changed: server/index.js, client/App.js, client/src/screens/GameScreen.jsx, server/scripts/matchLifecycleTest.js, client/src/config.js
[14:05 UTC] [DONE] v5.113 deployed + verified on prod — 42/42 across all 3 suites incl. real 20s grace expiry + same-match rejoin
[21:10 UTC] [START] digital ads asset pack — logo exports, screenshots, 4:5/1:1 images, 15s video (16:9/1:1/9:16), ad copy — output to poker/digital ads/
[21:20 UTC] [START] Lobby scroll fix — Online/Leaderboard section scrollable — branch fix/lobby-scroll
[21:23 UTC] [DONE] v5.129: lobby Online/Leaderboard panel internal scroll (maxHeight 360, hidden scrollbar) + PLAY/PLAY BOT equal-size + challenge buttons full 420 width — changed: client/src/screens/LobbyScreen.jsx, client/src/config.js — branch fix/lobby-scroll pushed, NOT merged to main
[21:25 UTC] [DONE] merged fix/lobby-scroll → main + pushed (Railway deploy 79b5692); branch deleted — ad-session untracked files untouched
[21:31 UTC] [START] Flags in Online + Leaderboard tabs — branch feature/leaderboard-flags
[21:39 UTC] [DONE] digital ads asset pack — poker/digital ads/: 3x 15s videos (16:9/1:1/9:16), 5 statics (2x 4:5, 2x 1:1, 1200x628), 3 logos, 6 screenshots, copy.md, README; pushed c62e967 direct to origin/main (checkout was switched to feature/leaderboard-flags by concurrent session mid-task — commit also sits on that branch, harmless); guest player AceMonkey (guest_chrome_*) left on prod
[21:42 UTC] [START] geo provider swap ipwho.is → ip-api.com (ipwho.is blocks Node fetch) — branch fix/geo-provider
[21:45 UTC] [DONE] digital ads REGENERATE.md playbook saved + memory pointer — pipeline reusable for post-redesign rerun
[22:09 UTC] [START] animated motion-graphics ad prototype (9:16) — WAAPI/HTML rig + frame-stepped capture in digital ads/_build/animate.js — this session owns digital ads/ until DONE
[22:15 UTC] [DONE] animated motion-graphics ad prototype — digital ads/video/poker_monkey_15s_9x16_motion.mp4 (15s, 4 scenes, frame-stepped WAAPI rig) — changed: digital ads/_build/animate.js (new), REGENERATE.md, README.md — digital ads/ released
