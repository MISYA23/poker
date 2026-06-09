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
