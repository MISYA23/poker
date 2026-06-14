# Poker Monkey — TikTok Ad Assets

Everything needed to run Poker Monkey ads on TikTok. Built from the app's own brand assets (pirate-monkey hero, treasure-island art, monkey-skull chips, "1 ON 1 POKER" flag).

## What's here
```
ad-assets/
├── README.md              ← this file
├── SCRIPTS.md             ← 5 TikTok ad concepts (hooks, beats, captions, hashtags) + specs
├── GAMEPLAY-CAPTURE.md    ← how to record real gameplay clips for ads
├── images/                ← 10 ready-to-post static ads (1080×1920 PNG) + their HTML source
│   ├── 01-hook-beat-the-monkey.png   "Can you beat the monkey?"  (hook / virality)
│   ├── 02-how-it-works.png           "3 taps to a showdown"      (installs / clarity)
│   ├── 03-no-bots.png                "Real players, real stakes" (trust / differentiation)
│   ├── 04-elo-climb.png              "Every win raises your rank"(retention / status)
│   ├── 05-download-cta.png           "Play free right now"       (conversion / CTA)
│   ├── 06-free-headsup.png           "Free heads-up poker"       (free + real gameplay shot)
│   ├── 07-climb-elo.png              "Climb the ELO leaderboard" (real leaderboard UI)
│   ├── 08-fun-fast-free.png          "Fun · Fast · Free"         (value props + avatars)
│   ├── 09-most-fun.png               "Most fun free heads-up"    (avatar roster + gameplay)
│   └── 10-global-rankings.png        "Global rankings"           (leaderboard + country flags)
├── promo/
│   ├── promo.html         ← coded animated 9:16 spot (queue→match→all-in→win→ELO→CTA)
│   ├── promo.mp4          ← rendered video, 1080×1920, 30fps, ~7.2s, loops cleanly
│   └── capture-mp4.sh     ← regenerates promo.mp4 from promo.html
├── assets/                ← brand source images the templates reference
├── fonts/                 ← Anton + Archivo Black, embedded (fonts.css) so renders are reproducible
└── render.sh              ← rebuilds all static PNGs from the HTML in images/
```

## Ready to upload today
- **5 static images** in `images/*.png` — drop straight into TikTok Ads Manager (image/carousel) or post organically.
- **`promo/promo.mp4`** — the animated video spot.
- Pair each with the matching concept's caption + hashtags from `SCRIPTS.md`.

## Editing & re-rendering
Everything is generated from HTML by headless Chrome — no design tools needed.

- **Change a static ad:** edit the `.html` in `images/`, then `./render.sh` → all PNGs rebuild.
- **Change the video:** edit `promo/promo.html`, preview by opening it in a browser (it auto-plays/loops), then `cd promo && ./capture-mp4.sh` → new `promo.mp4`.
- Headline font is **Anton**, body is **Archivo Black**, embedded as base64 in `fonts/fonts.css` (so rendering works offline and looks identical every time).

## TikTok specs (see SCRIPTS.md for detail)
- 9:16 vertical, 1080×1920 ✓ (all assets match)
- Hook in first 2s; 9–15s converts best for installs
- **Safe zone:** for *paid in-feed* ads, keep the CTA/logo out of the bottom ~480px & right ~120px (platform overlays UI there). Current designs place CTAs low for organic/Spark posts — nudge them up if running paid in-feed.
- No real-money-gambling claims (free, ELO-based) — keeps it ad-policy + app-store safe.

## Want more?
- Variants/sizes (1:1 1080×1080, 4:5 1080×1350) — easy to add as new HTML templates.
- Real gameplay footage spliced into the promo — see `GAMEPLAY-CAPTURE.md`.
