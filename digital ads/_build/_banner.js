const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 720, height: 50 } });
  await p.setContent(`<body style="margin:0;width:720px;height:50px;background:#0a1322;display:flex;align-items:center;justify-content:center;font-family:'Arial Black',Arial,sans-serif">
    <span style="color:#f0c040;font-size:22px;font-weight:900;letter-spacing:.08em">POKER MONKEY&nbsp;&nbsp;·&nbsp;&nbsp;FREE 1-ON-1 HOLD&rsquo;EM</span></body>`);
  await p.screenshot({ path: path.join(__dirname, '_endcards', 'banner_720x50.png') });
  await b.close();
})();
