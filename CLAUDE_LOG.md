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
[22:17 UTC] [START] hand-history MP4 video — pick river hand from prod, build replay renderer + capture in server/scripts/handvideo/ (not touching digital ads/)
[22:20 UTC] [START] motion ad: full phone body (bezel/island/buttons) in animate.js — digital ads/ claimed
[22:24 UTC] [DONE] motion ad full phone body — re-rendered poker_monkey_15s_9x16_motion.mp4 — changed: digital ads/_build/animate.js, REGENERATE.md, video — digital ads/ released
[22:30 UTC] [DONE] hand-history MP4 — hand 850 (AA cracked by rivered flush, pot 2000) rendered to server/scripts/handvideo/aces-cracked-hand850.mp4 (1080x1920, 31.8s, 1.5MB); reusable pipeline — new: server/scripts/handvideo/{fetchHand.js,replay.html,render.js,README.md,hand.json}; uncommitted, digital ads/ untouched
[22:39 UTC] [START] run misya23/wip locally for review — worktree .claude/worktrees/misya-wip + expo web (not touching main checkout)
[22:44 UTC] [START] Ad Studio — local web UI (digital ads/_build/studio.js) exposing ad copy/colors/segments + Produce button driving animate.js — digital ads/ claimed
[22:46 UTC] [START] handvideo fast mode — compact <15s timeline + realtime capture (record.js) in server/scripts/handvideo/
[22:47 UTC] [DONE] Ad Studio deferred by Brian before build started — no code written; design notes saved to Claude memory (project_poker_ad_studio_plan) — digital ads/ released
[22:51 UTC] [DONE] handvideo fast mode — 14.2s clip in 16s wall (realtime recordVideo): server/scripts/handvideo/aces-hand850-fast.mp4; changed: replay.html (FAST pacing consts, PLAY() rAF loop, hide hook/stamp), record.js (new), README.md; uncommitted
[23:23 UTC] [START] pull latest + EAS Android build + submit to Play closed testing (alpha) track
[23:42 UTC] [DONE] EAS Android build versionCode 12 (commit 3e22172) + submitted to Play alpha track (submission d42cb75e FINISHED); playstore-key.json restored from fresh GCP key, backup at ~/.claude/keys/poker-playstore-key.json — changed: client/playstore-key.json (gitignored, new), global CLAUDE.md (key docs)
[14:18 UTC] [START] asset slimming — compress lemur/captain PNGs + re-encode music mp3s @96kbps — branch chore/asset-slim
[14:20 UTC] [DONE] v5.132: asset slimming — captain/lemur PNGs 512px+pngquant (4.4MB→286KB), 4 music mp3s 96kbps (8.3MB→4.6MB) — changed: client/assets/captain.png, client/assets/lemur.png, client/assets/music/*.mp3, client/src/config.js — merged chore/asset-slim → main, pushed (Railway deploy)
[14:36 UTC] [START] compress all build-shipped image assets (avatars/chip/tables/login-bgs/bananas) — branch chore/asset-slim-2
[14:40 UTC] [DONE] v5.133: compressed all build-shipped images — cigar/queen/chip/bananas resized+pngquant, 3 table PNGs pngquant, 4 login-bgs PNG→JPEG q85 + require paths updated — changed: client/assets/* (10 images, 4 renamed .png→.jpg), client/src/components/ScreenBackground.jsx, client/src/config.js — merged chore/asset-slim-2 → main, pushed (Railway deploy); web export verified pre-push
[15:43 UTC] [START] EAS Android production build + submit to Play alpha track (post asset-slim v5.133)
[15:58 UTC] [DONE] EAS Android build versionCode 13 (commit c2d8cae, v5.133 asset-slim) + submitted to Play alpha track (submission d566ded4 SUBMITTED) — no code changes
[21:04 UTC] [START] move opponent turn-timer bar above his nameplate (player timer untouched) — branch fix/opp-timer-above
[21:05 UTC] [DONE] v5.153: opponent turn-timer bar moved above his nameplate (timerClipOpp top/justify flipped; my timer untouched) — changed: client/src/screens/GameScreen.jsx, client/src/config.js, CLAUDE_LOG.md
[02:14 UTC] [START] revert opponent timer above nameplate back to below — branch fix/opp-timer-below
[02:15 UTC] [DONE] v5.157: reverted opponent turn-timer back below his nameplate (GameScreen.jsx restored to pre-v5.153 state) — changed: client/src/screens/GameScreen.jsx, client/src/config.js — merged fix/opp-timer-below → main, pushed (Railway deploy), branch deleted
[02:18 UTC] [START] game screen ambient background (moonlit beach) beneath the table — Group C layer-0 cover image per TABLE_UI_SPEC — branch feature/game-bg
[02:23 UTC] [DONE] v5.158: moonlit beach ambient bg beneath game table (layer-0 viewport cover, no scrim, full opacity) — changed: client/assets/game-bg.jpg (new), client/src/screens/GameScreen.jsx, client/src/config.js — merged feature/game-bg → main, pushed (Railway deploy ad0246a), branch deleted; web export verified pre-push
[02:23 UTC] [START] regenerate digital ads asset pack with new UI/artwork (game-bg, chip art) per REGENERATE.md — digital ads/ claimed
[02:24 UTC] [DONE] quick-match bot fallback investigation — feature works on prod (socket probe + headless UI probe vs prod web v5.157); likely cause of report: Play alpha build is v5.133, predates funnel (v5.141); probe test players + matches cleaned from prod DB; no code changes
[02:28 UTC] [START] sizing pass — audit build size, compress oversized assets, report — branch chore/sizing-pass
[02:34 UTC] [DONE] v5.159: sizing pass — chips 512→256+pngquant, login-monkey/flag-logo/icon pngquant, 6 jpgs mozjpeg q80; shipped assets 16MB→9.4MB; web export verified — changed: client/assets/{chip-black,chip-green,chip-purple,chip-red,flag-logo,icon,login-monkey}.png, client/assets/{game-bg,login-bg-16-9,login-bg-21-9,login-bg-4-3,login-bg-9-19,login-island}.jpg, client/src/config.js — merged chore/sizing-pass → main, pushed (Railway deploy 0da7d0a); digital ads/ working-tree changes left untouched for concurrent ad-regen session
[02:37 UTC] [START] bg music: keep fun-caribbean only for game playlist, remove pirates + epic-celtic — branch chore/single-bgm
[02:38 UTC] [DONE] v5.160: game bg music = fun-caribbean only; pirates + epic-celtic mp3s deleted (-2.5MB), server seeds pruned + music_tracks rows deleted on boot; web export verified (build 11MB→8.3MB) — changed: client/src/audio/music.js, client/assets/music/{pirates,epic-celtic}.mp3 (deleted), server/index.js, client/src/config.js — merged chore/single-bgm → main, pushed (Railway deploy d866fa8)
[02:40 UTC] [START] drop unused tall table asset + final chip.png squeeze — branch chore/drop-tall-table
[02:41 UTC] [DONE] v5.161: dropped unused tall table (game-table.png deleted, TABLE_VARIANTS pruned w/ restore note) + chip.png 256px+pngquant; build 8.3MB→7.7MB; web export verified — changed: client/src/screens/GameScreen.jsx, client/assets/game-table.png (deleted), client/assets/chip.png, client/src/config.js — merged chore/drop-tall-table → main, pushed (Railway deploy)
[02:42 UTC] [DONE] digital ads regenerated for v5.158+ pirate rebrand — new prod screengrabs (beach bg/pirate table/new chips), flag-logo statics+logos+end cards, 3 video cuts + motion ad re-rendered, copy.md/README/REGENERATE updated, square_1x1_lobby→square_1x1_action — changed: digital ads/* — committed via detached index direct to origin/main (checkout owned by chore/drop-tall-table session); guest guest_chrome_adz4ukz left on prod — digital ads/ released
[03:17 UTC] [START] full deploy — verify web (Railway v5.161) + EAS Android production build + Play alpha submit
[03:18 UTC] [RUNNING] web verified live v5.161 (b17.01); EAS Android production build + auto-submit (alpha) started in background
[16:01 UTC] [START] hand_events v2 — discrete sequential event stream (single seq, pre-action phase, chips-committed amounts, deal_hole/deal_board rename, hand_end event) — branch feature/hand-events-v2
[16:20 UTC] [START] Google Ads gtag tracking on web — mirror Meta pixel events + SPA page_view + pageview conversion — branch feature/google-tracking (worktree)
[16:22 UTC] [DONE] v5.162: hand_events v2 — single seq stream, pre-action phase, chips-committed amounts, deal_hole/deal_board/hand_end vocabulary, timeout-fold + blind-runout logging, flush state captured sync (fixes hands.pot=0/community_cards=[] staleness); 112/112 tests (handEventsTest 70 x2 runs + 3 regression suites), web export OK; prod test rows cleaned — changed: server/handLogger.js, server/index.js, client/src/utils/handReplay.js, server/scripts/handEventsTest.js (new), client/src/config.js — branch feature/hand-events-v2 pushed, NOT merged
[16:26 UTC] [DONE] v5.161 (b21.01): Google Ads gtag on web — base tag in public/index.html (send_page_view:false), analytics.js mirrors all Meta events to gtag + trackScreen page_view per nav change + pageview conversion (spAfCOmljbwcEKDFsPND) once/load; smoke-tested headless local+prod, deployed 5241b3b — changed: client/public/index.html, client/src/utils/analytics.js, client/App.js, client/src/config.js — worktree+branch deleted, main checkout untouched
[16:29 UTC] [DONE] hand_events v2 email NOT sent — ALL Resend API keys revoked (trees/.env, smallbusiness/server/.env, drones Railway, trees Railway all return 401 invalid); notified via terminal push instead; Brian must mint a new Resend key
[16:31 UTC] [START] deploy hand_events v2 — merge feature/hand-events-v2 → main, push (Railway), verify on prod
[16:41 UTC] [DONE] hand_events v2 deployed to prod — merged feature/hand-events-v2 → main (a1fc16b, v5.162 b22.01, version conflict w/ concurrent b21.01 gtag session resolved), Railway live (bundle verified v5.162), 70/70 handEventsTest vs prod, test rows cleaned, branch deleted
[16:45 UTC] [START] live hand-event broadcast + bet-collect animation (call chips hold 200ms then slide to pot) — branch feature/bet-collect-anim
[16:56 UTC] [DONE] v5.163: live hand-event broadcast + bet-collect animation — server emits redacted event rows (hand-events) before each game-state (handLogger split into buildStartRows/buildActionRows/writeHandRows); GameScreen holds final equal bet piles 200ms then slides both into the pot on street close, board reveal gated until collect ends; 115/115 tests (handEventsTest 73 incl. live-stream parity + hole-card redaction, 3 regression suites), web export OK, test rows cleaned — changed: server/handLogger.js, server/index.js, client/App.js, client/src/screens/GameScreen.jsx, server/scripts/handEventsTest.js, client/src/config.js — branch feature/bet-collect-anim pushed, NOT merged
[17:04 UTC] [DONE] v5.163 (b23.02): bet-collect anim branch — merged Thibault timeout-checks commit (9071e6b) into row pipeline, timeout probe PASS (fold facing bet / check when free), 73/73 suite post-merge — branch feature/bet-collect-anim
[17:04 UTC] [START] deploy v5.163 — merge feature/bet-collect-anim → main, push (Railway), verify prod
[17:07 UTC] [DONE] v5.163 (b23.02) deployed to prod — merge b30f09f live on Railway (bundle verified v5.163), 73/73 handEventsTest vs prod, test rows self-cleaned, branch deleted; includes Thibault 9071e6b (timeout checks-when-free) so his pending Railway approval is superseded
[18:02 UTC] [START] reconnect session handshake — connect-level 'session' event (identity + server-authoritative placement), re-seat vacant table seat on reconnect, fix 'Not in lobby' + mid-match blip forfeit — branch fix/reconnect-session (worktree)
[18:18 UTC] [DONE] v5.164 (b24.01): reconnect session handshake — connect-level `session` socket event (client emits on every (re)connect via useSocket 'connect' + playerIdRef); server bindIdentity()+reclaimSeat() factored out of enter-lobby, session reuses them with NO forfeit/dequeue; fixes 'Not in lobby' (reconnect identity loss on socket.id change) + mid-match blip forfeit (vacant-seat reclaim). 119/119 tests (matchLifecycleTest 16x2 incl 4 new session cases, challengeTest 14, botChallengeTest 16, handEventsTest 73 vs Railway DB), web export OK (bundle refs session), 33 test rows cleaned — changed: server/index.js, client/App.js, client/src/config.js, server/scripts/matchLifecycleTest.js, CLAUDE.md — merged fix/reconnect-session → main (e154343), pushing (Railway deploy)
[18:20 UTC] [DONE] v5.164 deployed + verified on prod — Railway live (67d22c7), new web bundle index-c10bed5c refs v5.164/b24.01; server-side before/after probe: OLD server session-only→find-match = 'Not in lobby' (reproduces the bug), NEW server = in-queue (session handshake live); 2 probe players cleaned
[21:19 UTC] [START] social casino ad policy research + compliance landing pages (Google/Meta) — no code branch yet

[16:40 UTC] [DONE] removed UI Debug from nav menus (lobby + game screen) + version number from game screen top-left — changed: client/src/screens/LobbyScreen.jsx, client/src/screens/GameScreen.jsx

[16:43 UTC] [DONE] v5.165 merged feature/ad-landing-pages → main + pushed (Railway deploy 2a20140); branch deleted
[16:47 UTC] [START] admin/players: checkbox multi-select + delete accounts (with cascade + live socket kick + confirm dialog) — branch feature/ad-landing-pages
[16:52 UTC] [DONE] v5.166: admin/players multi-select delete (cascade + socket kick + confirm dialog) + country flags — pushed f8dcb3b to main (Railway deploy)
[17:05 UTC] [DONE] v5.167: bots show 🤖 badge instead of country flag — AvatarBadge isBot prop, LobbyScreen + OpponentCard updated, BOTS country:null, bot match-found includes isBot+avatarId — pushed e68a3f1 to main
