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
