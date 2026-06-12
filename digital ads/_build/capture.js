// Capture gameplay footage + screenshots from the live Poker Monkey web app.
// Logs in as a throwaway guest, plays a bot match, records video + periodic stills.
// Run: node capture.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'https://poker-production-d726.up.railway.app';
const OUT = path.join(__dirname, 'raw');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const playerId = `guest_chrome_ad${Math.random().toString(36).slice(2, 7)}`;
  const name = 'AceMonkey';
  fs.writeFileSync(path.join(OUT, 'player.txt'), playerId);

  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error('guest upsert failed: ' + resp.status);
  console.log('guest created:', playerId);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 720, height: 1280 },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 720, height: 1280 } },
  });
  await context.addInitScript(([pid, pname]) => {
    localStorage.setItem('poker_user', JSON.stringify({ playerId: pid, name: pname }));
    // Strip dev chrome from footage: version watermark + feedback pill.
    const clean = () => {
      if (!document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (/v\d+\.\d+/.test(n.textContent) && !/Blinds/.test(n.textContent)) {
          n.textContent = n.textContent.replace(/v\d+\.\d+\S*(\s*\(?b?[\d.]*\)?)?/, '').trim();
        }
        if (/Feedback/.test(n.textContent)) {
          let el = n.parentElement;
          for (let i = 0; el && i < 4; i++) {
            if (el.getAttribute && el.getAttribute('role') === 'button') { el.style.display = 'none'; break; }
            el = el.parentElement;
          }
          if (n.parentElement) n.parentElement.style.display = 'none';
        }
      }
    };
    setInterval(() => { try { clean(); } catch {} }, 250);
  }, [playerId, name]);

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Lobby (v5.158 redesign: QUICK MATCH hero + "Looking to play" list).
  // Do NOT click QUICK MATCH — it broadcasts a challenge to every human online.
  // The house bot row ("Always ready 🤖") starts a bot match instantly; it is
  // rendered last in the list, so its VS button is the last one on the page.
  await page.getByText('Always ready', { exact: false }).first().waitFor({ timeout: 30000 });
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOTS, 'lobby.png') });

  await page.getByText(/^VS$/).last().click();
  console.log('clicked VS on house bot');
  await page.getByText(/^Fold$/).first().waitFor({ timeout: 30000 });
  console.log('in match');
  await sleep(800);
  await page.screenshot({ path: path.join(SHOTS, 'game-000.png') });

  // Play for ~85s: mostly call/check, sometimes raise for visual interest.
  const start = Date.now();
  let shot = 1;
  let lastShot = Date.now();
  let acted = 0;
  while (Date.now() - start < 85000) {
    // match over?
    const over = page.getByText(/Play Again/i).first();
    if (await over.isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(SHOTS, 'match-over.png') });
      console.log('match over modal');
      break;
    }
    // periodic stills
    if (Date.now() - lastShot > 3000) {
      await page.screenshot({ path: path.join(SHOTS, `game-${String(shot++).padStart(3, '0')}.png`) }).catch(() => {});
      lastShot = Date.now();
    }
    // my turn?
    const fold = page.getByText(/^Fold$/).first();
    if (await fold.isVisible().catch(() => false)) {
      const raise = page.getByText(/^(Bet|Raise) [\d,]+$/).first();
      const callOrCheck = page.getByText(/^(Check|Call)/).first();
      const allIn = page.getByText(/^All In$/).first();
      const canCall = await callOrCheck.isVisible().catch(() => false);
      const canRaise = await raise.isVisible().catch(() => false);
      const doRaise = acted % 4 === 2 && canRaise;
      try {
        if (!canCall && !canRaise && (await allIn.isVisible().catch(() => false))) {
          // Facing a shove: only Fold / All In exist. Hold the drama on camera,
          // then fold early in the run (keep the match alive) or call late.
          await sleep(3500);
          await page.screenshot({ path: path.join(SHOTS, `game-${String(shot++).padStart(3, '0')}.png`) }).catch(() => {});
          if (Date.now() - start > 55000) { await allIn.click({ timeout: 1500 }); console.log('called all-in'); }
          else { await fold.click({ timeout: 1500 }); console.log('folded to shove'); }
        }
        else if (doRaise) { await raise.click({ timeout: 1500 }); console.log('raised'); }
        else if (canCall) {
          await callOrCheck.click({ timeout: 1500 }); console.log('called/checked');
        }
        acted++;
        await sleep(600);
        await page.screenshot({ path: path.join(SHOTS, `game-${String(shot++).padStart(3, '0')}.png`) }).catch(() => {});
      } catch (e) { /* button vanished mid-click; keep going */ }
    }
    await sleep(400);
  }

  await sleep(1500);
  const video = page.video();
  await context.close();
  const vpath = await video.path();
  fs.renameSync(vpath, path.join(OUT, 'gameplay.webm'));
  console.log('video saved:', path.join(OUT, 'gameplay.webm'));
  await browser.close();
})();
