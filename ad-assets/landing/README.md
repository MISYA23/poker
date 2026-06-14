# Poker Monkey — Landing-Page Hero Images

Messaged versions of every login background, for use at **pokermonkey.app**.
Each output PNG matches its source login image **pixel-for-pixel** (same dimensions),
so it can swap straight into the same viewport slot. Originals in `client/assets`
are untouched.

Every image carries the same elegant gold lockup:
- **HEADS-UP POKER** (headline)
- **100% FREE-TO-PLAY** (pill)
- **Climb Fun ELO Leaderboards**
- *No real-money gambling · No cash prizes · No withdrawals* (compliance strip, pinned bottom)

## Outputs (`*-landing.png`)
| File | Size | Source | Viewport |
|---|---|---|---|
| `login-bg-21-9-landing.png` | 1915×821 | login-bg-21-9.jpg | ultrawide desktop |
| `login-bg-16-9-landing.png` | 1672×941 | login-bg-16-9.jpg | desktop |
| `login-bg-4-3-landing.png`  | 1448×1086 | login-bg-4-3.jpg | tablet |
| `login-bg-9-19-landing.png` | 852×1846 | login-bg-9-19.jpg | phone (pirate-monkey scene) |
| `login-island-landing.png`  | 853×1844 | login-island.jpg + login-monkey.png | phone (island + monkey composite) |

The transparent `login-monkey.png` is a compositing layer, not a standalone
background, so its messaged version is folded into `login-island-landing.png`
(monkey anchored bottom-left, exactly as the in-app login composites it).

## Re-rendering
Everything is generated from HTML by headless Chrome — no design tools.
- Edit the matching `.html`, then `./build.sh` → all PNGs rebuild at exact source sizes.
- Headline font **Anton**, body **Archivo Black**, embedded base64 in `../fonts/fonts.css`
  (renders identically offline).
- Shared styling in `style.css`; per-image sizing/placement in each `.html`'s `<style>` block.
