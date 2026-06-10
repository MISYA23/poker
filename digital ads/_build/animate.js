// Animated motion-graphics ad (9:16, 15s @ 30fps) — WAAPI scene timeline rendered
// frame-by-frame in headless Chromium, assembled with ffmpeg.
// Scenes: logo hook (0-2.2s) → headline card (2.2-4.6s) → floating phone w/ real
// gameplay clip (4.6-11.8s) → animated CTA end card (11.8-15s).
// Run: node animate.js   (needs raw/ad_clip.webm — see REGENERATE.md)
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const W = 1080, H = 1920, FPS = 30, DUR_MS = 15000;
const FRAMES = Math.round((DUR_MS / 1000) * FPS); // 450
const FRAMES_DIR = path.join(__dirname, 'raw', 'frames');
const OUT = path.resolve(__dirname, '../video/poker_monkey_15s_9x16_motion.mp4');
const LOGO = 'file://' + path.resolve(__dirname, '../../client/assets/cigar.png');
const CLIP = 'file://' + path.join(__dirname, 'raw', 'ad_clip.webm');

// Video plays inside the phone from t=4900ms, clip is 7.2s.
const VIDEO_START = 4900, VIDEO_LEN = 7150;

const HTML = `<!doctype html><html><head><meta charset="utf8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background: radial-gradient(120% 100% at 50% 0%, #13233f 0%, #0a1322 55%, #060d18 100%);
         font-family:'Arial Black','Helvetica Neue',Arial,sans-serif; color:#fafafa; position:relative; }
  .abs { position:absolute; }
  .center { left:50%; transform:translateX(-50%); }
  .suits { inset:-400px 0 0 0; font-family:Georgia,serif; font-size:150px; line-height:1.7;
           word-spacing:36px; color:#f0c040; opacity:.05; }
  .gold { color:#f0c040; }
  /* S1 — logo hook */
  #s1 { inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:54px; }
  #s1 img { width:440px; height:440px; border-radius:50%; }
  #s1 .nm { font-size:92px; font-weight:900; letter-spacing:.1em; white-space:nowrap; }
  /* S2 — headline card */
  #s2 { inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:30px; }
  #s2 .eyebrow { color:#f0c040; letter-spacing:.22em; font-size:34px; font-weight:900; }
  #s2 .l1 { font-size:170px; font-weight:900; letter-spacing:-.01em; }
  #s2 .l2 { font-size:170px; font-weight:900; }
  /* S3 — floating phone */
  #s3 { inset:0; }
  #s3 .strip { top:120px; font-size:40px; font-weight:900; letter-spacing:.1em; color:#f0c040;
               background:rgba(10,19,34,.92); padding:26px 54px; border-radius:otational 999px; border-radius:999px;
               border:2px solid rgba(240,192,64,.5); white-space:nowrap; }
  #phoneWrap { top:300px; left:50%; width:760px; }
  #phone { width:760px; border-radius:54px; overflow:hidden; background:#0a1322;
           border:4px solid rgba(240,192,64,.6);
           box-shadow:0 60px 140px rgba(0,0,0,.7), 0 0 0 14px rgba(255,255,255,.04); }
  #phone video { width:100%; display:block; }
  /* S4 — end card */
  #s4 { inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:44px; }
  #s4 img { width:330px; height:330px; border-radius:50%; box-shadow:0 16px 70px rgba(240,192,64,.5); }
  #s4 .nm { font-size:96px; font-weight:900; letter-spacing:.08em; white-space:nowrap; }
  #s4 .tag { font-size:36px; color:#bdc3c7; font-family:Arial,sans-serif; font-weight:bold; text-align:center; max-width:86%; }
  #s4 .cta { background:linear-gradient(180deg,#f0c040,#d4a017); color:#101010; font-weight:900;
             font-size:56px; padding:30px 96px; border-radius:999px; box-shadow:0 12px 44px rgba(240,192,64,.45); }
  #s4 .fine { font-size:26px; color:rgba(250,250,250,.55); font-family:Arial,sans-serif; font-weight:bold; }
</style></head><body>
  <div class="abs suits" id="suits">${'♠ ♥ ♣ ♦ '.repeat(160)}</div>
  <div class="abs" id="s1"><img src="${LOGO}"><div class="nm">POKER <span class="gold">MONKEY</span></div></div>
  <div class="abs" id="s2">
    <div class="eyebrow">HEADS-UP TEXAS HOLD’EM</div>
    <div class="l1" id="l1">All in.</div>
    <div class="l2 gold" id="l2">Zero cost.</div>
  </div>
  <div class="abs" id="s3">
    <div class="abs center strip" id="strip">REAL GAMEPLAY · 100% FREE</div>
    <div class="abs center" id="phoneWrap"><div id="phone"><video src="${CLIP}" muted preload="auto"></video></div></div>
  </div>
  <div class="abs" id="s4">
    <img src="${LOGO}">
    <div class="nm">POKER <span class="gold">MONKEY</span></div>
    <div class="tag">Free Heads-Up Texas Hold’em — vs. live players &amp; bots</div>
    <div class="cta" id="cta">Play Free Now</div>
    <div class="fine">Free to play · No real money</div>
  </div>
<script>
  const A = [];
  const an = (el, kf, opt) => { const a = el.animate(kf, { fill:'both', ...opt }); a.pause(); A.push(a); return a; };
  const $ = (id) => document.getElementById(id);
  const pop = [{ transform:'scale(.2)', opacity:0 }, { transform:'scale(1.07)', opacity:1, offset:.7 }, { transform:'scale(1)', opacity:1 }];

  // background suits drift the whole spot
  an($('suits'), [{ transform:'translateY(0)' }, { transform:'translateY(340px)' }], { duration:15000 });

  // S1: logo pops, wordmark rises; whole group fades out
  $('s1').style.opacity = 1;
  an($('s1').querySelector('img'), pop, { duration:650, easing:'cubic-bezier(.2,1.4,.4,1)' });
  an($('s1').querySelector('.nm'), [{ transform:'translateY(70px)', opacity:0 }, { transform:'translateY(0)', opacity:1 }], { duration:500, delay:350, easing:'ease-out' });
  an($('s1'), [{ opacity:1, transform:'scale(1)' }, { opacity:1, transform:'scale(1)', offset:.86 }, { opacity:0, transform:'scale(1.06)' }], { duration:2350 });

  // S2: headline slams in, holds, fades
  an($('s2'), [{ opacity:0 }, { opacity:1 }], { duration:200, delay:2250 });
  an($('s2').querySelector('.eyebrow'), [{ opacity:0, transform:'translateY(-30px)' }, { opacity:1, transform:'translateY(0)' }], { duration:350, delay:2300, easing:'ease-out' });
  an($('l1'), [{ transform:'translateY(110px) scale(.85)', opacity:0 }, { transform:'translateY(0) scale(1)', opacity:1 }], { duration:420, delay:2380, easing:'cubic-bezier(.2,1.3,.4,1)' });
  an($('l2'), [{ transform:'translateY(110px) scale(.85)', opacity:0 }, { transform:'translateY(0) scale(1)', opacity:1 }], { duration:420, delay:2620, easing:'cubic-bezier(.2,1.3,.4,1)' });
  an($('s2'), [{ opacity:1 }, { opacity:0, transform:'scale(1.05)' }], { duration:350, delay:4250 });

  // S3: phone rises in, bobs, exits; strip drops in
  an($('s3'), [{ opacity:0 }, { opacity:1 }], { duration:250, delay:4550 });
  an($('strip'), [{ transform:'translate(-50%,-90px)', opacity:0 }, { transform:'translate(-50%,0)', opacity:1 }], { duration:450, delay:4900, easing:'cubic-bezier(.2,1.3,.4,1)' });
  an($('phoneWrap'), [{ transform:'translate(-50%,320px) rotate(-5deg)', opacity:0 }, { transform:'translate(-50%,0) rotate(-1.5deg)', opacity:1 }], { duration:650, delay:4600, easing:'cubic-bezier(.2,1.2,.4,1)' });
  an($('phone'), [{ transform:'translateY(0)' }, { transform:'translateY(-16px)' }, { transform:'translateY(0)' }], { duration:3200, delay:5250, iterations:2 });
  an($('s3'), [{ opacity:1, transform:'scale(1)' }, { opacity:0, transform:'scale(.96)' }], { duration:380, delay:11520 });

  // S4: end card up, CTA pulses
  an($('s4'), [{ opacity:0, transform:'translateY(60px)' }, { opacity:1, transform:'translateY(0)' }], { duration:480, delay:11800, easing:'ease-out' });
  an($('cta'), [{ transform:'scale(1)' }, { transform:'scale(1.07)', offset:.5 }, { transform:'scale(1)' }], { duration:900, delay:12500, iterations:3 });

  // initial state: everything driven by fill:both at t=0
  const video = document.querySelector('video');
  window.seekTo = async (ms) => {
    for (const a of A) a.currentTime = ms;
    const vt = Math.max(0, Math.min(${VIDEO_LEN}, ms - ${VIDEO_START})) / 1000;
    if (ms >= ${VIDEO_START} - 700 && Math.abs(video.currentTime - vt) > 0.001) {
      await new Promise((res) => {
        const done = () => { video.removeEventListener('seeked', done); res(); };
        video.addEventListener('seeked', done);
        video.currentTime = vt;
        setTimeout(done, 400); // safety: don't hang on a missed event
      });
    }
    return true;
  };
  window.ready = new Promise((res) => {
    if (video.readyState >= 2) res(); else video.addEventListener('loadeddata', () => res());
  });
</script></body></html>`;

(async () => {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  const tmp = path.join(__dirname, '_anim.html');
  fs.writeFileSync(tmp, HTML);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.ready);
  // initialize all animations at t=0
  await page.evaluate(() => window.seekTo(0));

  const t0 = Date.now();
  for (let f = 0; f < FRAMES; f++) {
    const ms = (f * 1000) / FPS;
    await page.evaluate((m) => window.seekTo(m), ms);
    await page.screenshot({ path: path.join(FRAMES_DIR, `f${String(f).padStart(4, '0')}.png`) });
    if (f % 60 === 0) console.log(`frame ${f}/${FRAMES} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  await browser.close();
  fs.unlinkSync(tmp);

  console.log('assembling mp4…');
  execSync(
    `ffmpeg -v error -y -framerate ${FPS} -i "${FRAMES_DIR}/f%04d.png" ` +
    `-f lavfi -t 15 -i anullsrc=r=44100:cl=stereo ` +
    `-c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart -shortest "${OUT}"`,
    { stdio: 'inherit' }
  );
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log('done:', OUT);
})();
