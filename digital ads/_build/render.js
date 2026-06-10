// Render static ad images + video end cards by screenshotting HTML templates.
// Run: node render.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'raw', 'shots');
const LOGO = path.resolve(__dirname, '../../client/assets/cigar.png');

const file = (p) => 'file://' + p;
const SHOT_ALLIN = file(path.join(SHOTS, 'game-008.png'));
const SHOT_SHOWDOWN = file(path.join(SHOTS, 'game-050.png'));
const SHOT_LOBBY = file(path.join(SHOTS, 'lobby.png'));
const LOGO_URL = file(LOGO);

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; overflow:hidden; }
  body {
    background: radial-gradient(120% 100% at 50% 0%, #13233f 0%, #0a1322 55%, #060d18 100%);
    font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
    color:#fafafa; position:relative;
  }
  .suits { position:absolute; inset:0; overflow:hidden; pointer-events:none; opacity:.05; font-size:140px; line-height:1.6; word-spacing:30px; color:#f0c040; font-family: Georgia, serif; }
  .eyebrow { color:#f0c040; letter-spacing:.18em; font-weight:900; }
  h1 { font-weight:900; line-height:1.04; letter-spacing:-.01em; }
  .gold { color:#f0c040; }
  .cta {
    display:inline-block; background:linear-gradient(180deg,#f0c040,#d4a017);
    color:#101010; font-weight:900; border-radius:ara 999px; border-radius:999px;
    box-shadow:0 10px 34px rgba(240,192,64,.42);
  }
  .phone {
    border-radius:36px; overflow:hidden; background:#0a1322;
    border:3px solid rgba(240,192,64,.55);
    box-shadow:0 34px 90px rgba(0,0,0,.65), 0 0 0 10px rgba(255,255,255,.04);
  }
  .phone img { width:100%; display:block; }
  .fineprint { color:rgba(250,250,250,.55); font-family:Arial, sans-serif; font-weight:bold; }
  .brand { display:flex; align-items:center; gap:18px; }
  .brand img { border-radius:50%; box-shadow:0 6px 26px rgba(240,192,64,.5); }
  .brand .nm { font-weight:900; letter-spacing:.06em; }
`;

const suitRow = '♠ ♥ ♣ ♦ '.repeat(60);

function pagePrimary({ w, h, eyebrow, line1, line2, shot, shotShiftPct = -8, cta }) {
  // Portrait/square layout: brand top, headline, phone screenshot, CTA bottom.
  const phoneW = Math.round(w * 0.62);
  return `<!doctype html><html><head><meta charset="utf8"><style>${BASE_CSS}
    .wrap { width:${w}px; height:${h}px; padding:${Math.round(h * 0.045)}px ${Math.round(w * 0.07)}px; display:flex; flex-direction:column; align-items:center; position:relative; }
    .brand img { width:${Math.round(w * 0.085)}px; height:${Math.round(w * 0.085)}px; }
    .brand .nm { font-size:${Math.round(w * 0.034)}px; }
    h1 { font-size:${Math.round(w * 0.078)}px; text-align:center; margin-top:${Math.round(h * 0.022)}px; }
    .eyebrow { font-size:${Math.round(w * 0.024)}px; margin-top:${Math.round(h * 0.025)}px; }
    .phonebox { flex:1; width:${phoneW}px; margin-top:${Math.round(h * 0.03)}px; position:relative; overflow:hidden; }
    .phone { position:absolute; top:0; left:0; right:0; }
    .fade { position:absolute; left:-4px; right:-4px; bottom:-4px; height:${Math.round(h * 0.22)}px; background:linear-gradient(180deg, rgba(6,13,24,0), #060d18 72%); z-index:2; }
    .cta { font-size:${Math.round(w * 0.042)}px; padding:${Math.round(h * 0.022)}px ${Math.round(w * 0.085)}px; position:relative; z-index:3; margin-top:-${Math.round(h * 0.05)}px; }
    .fineprint { font-size:${Math.round(w * 0.0185)}px; margin-top:${Math.round(h * 0.016)}px; position:relative; z-index:3; }
  </style></head><body>
    <div class="suits">${suitRow}</div>
    <div class="wrap">
      <div class="brand"><img src="${LOGO_URL}"><span class="nm">POKER&nbsp;MONKEY</span></div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${line1}<br><span class="gold">${line2}</span></h1>
      <div class="phonebox">
        <div class="phone"><img src="${shot}" style="margin-top:${shotShiftPct}%"></div>
        <div class="fade"></div>
      </div>
      <div class="cta">${cta}</div>
      <div class="fineprint">Free to play · No real money · Play in your browser</div>
    </div>
  </body></html>`;
}

function pageLandscape({ w, h }) {
  return `<!doctype html><html><head><meta charset="utf8"><style>${BASE_CSS}
    .wrap { width:${w}px; height:${h}px; padding:0 ${Math.round(w * 0.055)}px; display:flex; align-items:center; gap:${Math.round(w * 0.05)}px; position:relative; }
    .left { flex:1.25; }
    .brand img { width:${Math.round(h * 0.155)}px; height:${Math.round(h * 0.155)}px; }
    .brand .nm { font-size:${Math.round(h * 0.062)}px; }
    h1 { font-size:${Math.round(h * 0.125)}px; margin-top:${Math.round(h * 0.05)}px; }
    .cta { font-size:${Math.round(h * 0.062)}px; padding:${Math.round(h * 0.03)}px ${Math.round(h * 0.12)}px; margin-top:${Math.round(h * 0.045)}px; }
    .fineprint { font-size:${Math.round(h * 0.035)}px; margin-top:${Math.round(h * 0.022)}px; }
    .right { flex:1; align-self:stretch; position:relative; }
    .phone { position:absolute; top:${Math.round(h * 0.08)}px; left:0; right:0; }
    .fade { position:absolute; left:-2px; right:-2px; bottom:-2px; height:${Math.round(h * 0.3)}px; background:linear-gradient(180deg, rgba(6,13,24,0), #060d18 80%); z-index:2; }
  </style></head><body>
    <div class="suits">${suitRow}</div>
    <div class="wrap">
      <div class="left">
        <div class="brand"><img src="${LOGO_URL}"><span class="nm">POKER&nbsp;MONKEY</span></div>
        <h1>Heads-Up Hold'em.<br><span class="gold">Free. Rated. Live.</span></h1>
        <div class="cta">Play Free Now</div>
        <div class="fineprint">Free to play · No real money</div>
      </div>
      <div class="right">
        <div class="phone"><img src="${SHOT_ALLIN}" style="margin-top:-6%"></div>
        <div class="fade"></div>
      </div>
    </div>
  </body></html>`;
}

function pageLogoSquare(size) {
  return `<!doctype html><html><head><meta charset="utf8"><style>${BASE_CSS}
    .wrap { width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center; }
    img { width:86%; height:86%; border-radius:8%; }
  </style></head><body><div class="wrap"><img src="${LOGO_URL}"></div></body></html>`;
}

function pageLogoLandscape(w, h) {
  return `<!doctype html><html><head><meta charset="utf8"><style>${BASE_CSS}
    .wrap { width:${w}px; height:${h}px; display:flex; align-items:center; justify-content:center; gap:${Math.round(h * 0.18)}px; background:#0a1322; }
    img { width:${Math.round(h * 0.82)}px; height:${Math.round(h * 0.82)}px; border-radius:50%; }
    .nm { font-size:${Math.round(h * 0.3)}px; font-weight:900; letter-spacing:.08em; white-space:nowrap; }
  </style></head><body><div class="wrap"><img src="${LOGO_URL}"><span class="nm">POKER <span class="gold">MONKEY</span></span></div></body></html>`;
}

function pageEndCard(w, h) {
  const s = Math.min(w, h);
  return `<!doctype html><html><head><meta charset="utf8"><style>${BASE_CSS}
    .wrap { width:${w}px; height:${h}px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:${Math.round(s * 0.035)}px; position:relative; }
    img { width:${Math.round(s * 0.3)}px; height:${Math.round(s * 0.3)}px; border-radius:50%; box-shadow:0 14px 60px rgba(240,192,64,.5); }
    .nm { font-size:${Math.round(s * 0.085)}px; font-weight:900; letter-spacing:.08em; }
    .tag { font-size:${Math.round(s * 0.034)}px; color:#bdc3c7; font-family:Arial,sans-serif; font-weight:bold; text-align:center; max-width:88%; }
    .cta { font-size:${Math.round(s * 0.052)}px; padding:${Math.round(s * 0.024)}px ${Math.round(s * 0.085)}px; margin-top:${Math.round(s * 0.015)}px; }
    .fineprint { font-size:${Math.round(s * 0.024)}px; }
  </style></head><body>
    <div class="suits">${suitRow}</div>
    <div class="wrap">
      <img src="${LOGO_URL}">
      <div class="nm">POKER <span class="gold">MONKEY</span></div>
      <div class="tag">Free Heads-Up Texas Hold'em — vs. live players &amp; bots</div>
      <div class="cta">Play Free Now</div>
      <div class="fineprint">Free to play · No real money</div>
    </div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [
    // Meta / Instagram
    ['images/primary_4x5_allin.png', 1080, 1350, pagePrimary({
      w: 1080, h: 1350, eyebrow: 'HEADS-UP TEXAS HOLD’EM', line1: 'All in.',
      line2: 'Zero cost.', shot: SHOT_ALLIN, shotShiftPct: -7, cta: 'Play Free Now' })],
    ['images/primary_4x5_showdown.png', 1080, 1350, pagePrimary({
      w: 1080, h: 1350, eyebrow: '1V1 · ELO RATED · LIVE', line1: 'Think you can',
      line2: 'read a bluff?', shot: SHOT_SHOWDOWN, shotShiftPct: -4, cta: 'Prove It — Free' })],
    ['images/square_1x1_allin.png', 1080, 1080, pagePrimary({
      w: 1080, h: 1080, eyebrow: 'HEADS-UP TEXAS HOLD’EM', line1: 'All in.',
      line2: 'Zero cost.', shot: SHOT_ALLIN, shotShiftPct: -10, cta: 'Play Free Now' })],
    ['images/square_1x1_lobby.png', 1080, 1080, pagePrimary({
      w: 1080, h: 1080, eyebrow: 'PLAY IN YOUR BROWSER', line1: 'Beat the bots.',
      line2: 'Climb the ranks.', shot: SHOT_LOBBY, shotShiftPct: 0, cta: 'Play Free Now' })],
    // Google display / PMax
    ['images/landscape_1200x628.png', 1200, 628, pageLandscape({ w: 1200, h: 628 })],
    // Logos
    ['logo/logo_1200x1200.png', 1200, 1200, pageLogoSquare(1200)],
    ['logo/logo_512x512.png', 512, 512, pageLogoSquare(512)],
    ['logo/logo_landscape_1200x300.png', 1200, 300, pageLogoLandscape(1200, 300)],
    // Video end cards
    ['_endcards/end_1080x1920.png', 1080, 1920, pageEndCard(1080, 1920)],
    ['_endcards/end_1080x1080.png', 1080, 1080, pageEndCard(1080, 1080)],
    ['_endcards/end_1920x1080.png', 1920, 1080, pageEndCard(1920, 1080)],
  ];

  for (const [out, w, h, html] of jobs) {
    const dest = path.join(out.startsWith('_') ? __dirname : ROOT, out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const tmp = path.join(__dirname, '_tmp.html');
    fs.writeFileSync(tmp, html);
    await page.goto(file(tmp), { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: dest });
    await page.close();
    console.log('rendered', out);
  }
  await browser.close();
})();
