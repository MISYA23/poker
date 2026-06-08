# Poker Monkey — Table UI Layout & Responsive Spec

> Heads-up (1v1) poker. **React Native**, Android-first (~95% of traffic). Web/desktop is supported but gets **no special layout** — it's the same Android portrait screen with two concessions: scale up modestly and let the background fill the extra space. No landscape re-layout, no desktop breakpoints.

This document is layout/architecture only — **not** visual style. Where art is mentioned it's about how to *slice* assets, not how they look.

---

## 1. Core concept: three element groups

Every on-screen thing belongs to one of three groups, and each group obeys a **different responsive rule**. This split is the foundation of the whole system.

| Group | Members | Responsive rule |
|---|---|---|
| **A — Stage (content)** | Table felt, player pods (avatar + name/stack), hole cards, community cards, pot, per-player bets, dealer button | **Scales proportionally** with the table, as one unit |
| **B — Chrome (controls)** | Action buttons (Fold/Call/Raise), bet slider, hamburger menu, top status bar | **Docks to the device** edges; **fixed ergonomic size** (clamped) |
| **C — Environment** | Table background, corner embellishments (leaves, crate, barrel, lantern) | **Fills the viewport** behind/around everything |

**"Chrome"** = the framing controls the user operates *with* (buttons, bars, menus), as opposed to the content they look *at*. Chrome and content scale by different rules — that's the entire point of the grouping.

---

## 2. The layering model

Build the table as a **stack of independent layers**, never one composited image.

| Layer | Contains | Asset type | Anchoring |
|---|---|---|---|
| 0 · Ambient | Wood / scene fill | Tiling texture **or** one large cover image | Fills viewport (`cover`) |
| 1 · Props | Crate, barrel, foliage, lantern | Separate transparent PNGs | Pinned to screen corners |
| 2 · Surface | The oval rail + felt | Own PNG or SVG | Centered, fixed aspect |
| 3 · Game | Pods, cards, board, chips, pot, bets | Components | Relative to the surface |
| 4 · Chrome | Status bar, menu, action bar, slider | Components | Flex-docked to device edges |

**The one rule that matters most:** nothing **dynamic** ever lives inside an image — no numbers, names, cards, chips, timers, or buttons. If it changes at runtime it's a component in layer 3 or 4, positioned *over* the art.

### Why not bake the table into the background?
- A single baked image locks the scene to **one aspect ratio** → on any other shape it stretches (distorts) or letterboxes (black bars).
- The table is the **coordinate anchor**: community cards land on it, the pot sits on it, chips animate from players *to* it, the winner glows *on* it. Those positions must be addressable. Pixels inside a raster background are guesses that break the moment the image scales.
- Separation enables **reskins/theming** (swap felt without redrawing the scene) and lets the decorative border overhang edges without blocking the live region or fighting safe-area insets.

---

## 3. Responsive strategy — ONE fixed composition, scaled to fit

We deliberately chose the simpler of two strategies:

- **✅ Chosen — "One stage, scale to fit":** Lay out all of Group A as one fixed-proportion composition at a reference canvas, then scale that whole stage with `contain`. Pods, table, cards, pot, bets sit in fixed *relative* positions by design.
- **❌ Rejected — "Elastic bands":** table width-anchored, pods docking independently to top/bottom bands. Fills tall screens edge-to-edge but pods and table then scale by different rules → overlap bugs on short screens, more logic.

### What this means in practice
- **Group A is authored once** at a reference canvas and scaled as a single unit. You do **not** dynamically anchor pods to the table at runtime — the pod↔table relationship is baked into the composition, so it can never drift.
- **The only runtime work** is: (1) one scale factor for the stage, (2) docking the chrome, (3) filling leftover space with background.
- On tall phones the stage won't reach the vertical edges — the leftover becomes margin that the **background fills** (looks intentional). On web it's the same: "a very wide, very tall phone" — stage scales/centers, background fills the rest.

### Reference canvas
Author at **1080 × 2160** (1:2). Scale = `min(screenW / refW, screenH / refH)` (`contain` — nothing ever clips, you only ever get margins).

---

## 4. Scaling rules per group

### Group A — proportional
One master scale factor. If the stage renders at 85%, every card / pod / chip is 85%. Uniform; fixed proportions.

### Group B — constrained / ergonomic (does NOT ride the table's scale)
- **Width:** fully responsive — controls flex to fill the available width.
- **Height / tap target:** roughly constant, **clamped** (~56–72px), never below the ~48dp min-touch floor.
- **Font:** clamped, not proportional.
- **Tracks safe-area insets** (status bar, gesture bar, curved edges).
- May grow *slightly* on bigger devices for balance, but bounded — `clamp(min, preferred, max)`, not free-running with the table.

**Why B can't ride A's scale:** on a small phone, buttons would shrink below tappable; on a tablet/web, you'd get an absurd 200px-tall FOLD button. Mental model: **one zoom dial controls all of Group A; Group B is governed by min-tap-size + available width.**

---

## 5. Layout coordinate schema (the contract)

Because Group A is one fixed composition, the entire layout is **static data**. Store it as normalized, resolution-independent coordinates and feed it to the renderer:

```json
{
  "reference": { "w": 1080, "h": 2160 },
  "anchor": "center",
  "note": "x,y = element CENTER as fraction of canvas; w = width as fraction of canvas WIDTH; h derived from each element's intrinsic aspect (w/h)",
  "elements": {
    "table":          { "x": 0.50, "y": 0.455, "w": 0.78, "rot": 0, "z": 1 },
    "communityCards": { "x": 0.50, "y": 0.455, "w": 0.66, "rot": 0, "z": 2 },
    "pot":            { "x": 0.50, "y": 0.560, "w": 0.20, "rot": 0, "z": 3 },
    "opponentPod":    { "x": 0.50, "y": 0.165, "w": 0.56, "rot": 0, "z": 5 },
    "opponentCards":  { "x": 0.50, "y": 0.305, "w": 0.22, "rot": 0, "z": 4 },
    "opponentBet":    { "x": 0.50, "y": 0.375, "w": 0.14, "rot": 0, "z": 4 },
    "playerPod":      { "x": 0.50, "y": 0.820, "w": 0.56, "rot": 0, "z": 5 },
    "playerCards":    { "x": 0.43, "y": 0.700, "w": 0.30, "rot": 0, "z": 6 },
    "playerBet":      { "x": 0.50, "y": 0.620, "w": 0.14, "rot": 0, "z": 4 },
    "dealerButton":   { "x": 0.65, "y": 0.625, "w": 0.07, "rot": 0, "z": 5 }
  }
}
```

**Rules:**
- Positions are **fractions (0–1)**, never pixels — this is what survives scaling.
- One anchor convention: **x/y = element center**, as a fraction of the canvas.
- **Width** is a fraction of canvas *width*; **height is derived** from each element's intrinsic aspect ratio (don't store height).
- The renderer absolute-positions each element inside the scaled stage from this data. (Values above are a sane starting point, not gospel — tune them.)

---

## 6. Picking the table size

The binding constraint is your **shortest** screen, not your tallest:

1. Reference canvas = 1080 × 2160.
2. Felt width ≈ **70–80%** of canvas width — focal, but leaves rail margin for corner embellishments. Height follows the oval's aspect (~1 : 1.4).
3. Place: opponent pod overlapping the **top** of the oval; your pod + hole cards below the **bottom**; bets on the line between each pod and the pot; pot at the oval's lower-center.
4. **Verify the whole stage fits inside a 16:9 screen minus top chrome and bottom action bar.** If it fits there, it fits everywhere — taller phones just add margin. *This check is how you finalize the table size.*

### Why 16:9 is the worst case (the contain math)
With `contain`, on a **tall** phone (20:9) width binds → the stage is shorter than the screen → vertical margins → the docked action bar sits in the bottom margin, clear of the composition. On a **short/wide** phone (16:9) height binds → the stage fills full height → the docked action bar **overlaps the bottom of the composition** (your pod/cards). So validate against 16:9: if the player pod clears the action-bar band there, you're safe on everything taller.

---

## 7. Pods ↔ table

- Let each pod **overlap the table rail slightly** (sit a point on the ellipse, half-on the felt) rather than float clearly outside — visually fuses pod + table and saves vertical space.
- The pod can integrate avatar + name + stack into **one unit**.
- **Bets** live on the line between each pod and the pot (so the bets→pot flow reads).
- The **dealer button** hugs whichever pod holds it.
- All of this is part of the fixed composition — static positions, no runtime anchoring.

---

## 8. The bet slider (Group B — chrome)

**Vertical slider docked to the right edge.** Group B now has two docks: bottom (buttons) and right (slider). They stay distinct.

- **Reachability beats throw-length.** Don't span full height — occupy roughly the **lower 55–65%** of the right edge so it sits in the thumb arc. Drag up = more, down = less.
- **Scales like Group B, vertical axis:** track height flexes but **clamped** (min for precision throw, max so it never hits the top bar or climbs out of reach). Knob = fixed comfortable diameter. Readout stays legible.
- **Tracks the right safe-area** inset (curved edges / landscape notch).
- **Presets** pair well with a vertical track — labeled ticks: **All-in (top), Pot, ½ Pot, Min (bottom)** for one-tap common bets.
- **Persistent rail vs on-demand overlay:** recommendation = **on-demand** — only appears during your raise action, overlays the right rail (dead space), never covers cards or pot. Keeps the felt big.
- **Flow:** slider (right) **sets** the amount → the bottom **Raise button confirms** and reflects it ("Raise to 40"). Right thumb sizes, then drops to the button to commit.
- **TODO to feel out:** whether it sits *beside* the Raise button (right-edge rail anchored near it, extending up) or *floats up over* it. A vertical slider needs vertical room the button row lacks, so "beside/extending up" is the natural fit; "over it" only works as a slider that floats up from the button. *(Betting logic is owned by you.)*
- *(Backlog, not MVP: a left-handed mirror toggle — a right-edge slider favors right thumbs.)*

---

## 9. Action buttons (Group B)
Fold / Call / Raise pinned to the **bottom thumb zone**, flex to fill width, fixed clamped height, above the gesture bar. Three clear targets is right for heads-up.

---

## 10. Hamburger menu

Chrome — pinned **top-right**, fixed size, tracks the top safe-area inset.

- **Reserve a top strip** for it: the menu lives in a top chrome bar and the table stage starts *below* that bar, so game elements (e.g. opponent cards) can never collide with it.
- **Don't use a full slide-out drawer** — that's a content-app pattern, overkill for ~4 options.
- **Use a scrim + compact panel:** tap → dim the table behind a scrim, pop a small panel anchored top-right. The scrim (a) signals a modal state and (b) **blocks accidental table taps** (no misfires mid-hand). Tap scrim to close.
- **MVP contents:** Sound on/off, Settings, How to Play, Leave Table (with a confirm — leaving mid-hand = fold/forfeit).

---

## 11. Table layout principles (art-independent)

1. **Your hole cards are the hero** — largest cards, centered on your side just above the action bar. Opponent's face-down cards are deliberately smaller. Never size both equally.
2. **Both seats follow one mirrored logic** — pick a rule (e.g. avatar outboard, cards inboard, pill between) and apply the opponent as that rule flipped through center. No two ad-hoc arrangements.
3. **The center is a 5-card container** — it's Texas Hold'em; the board must legibly imply up to 5 community cards even when empty, not read as a decorative hole.
4. **Money reads bets → pot** — each bet sits just inside its seat toward center; the pot is at the middle; chips animate along that path.
5. **Even vertical rhythm** — distribute space so opponent / board / you breathe evenly; no big dead gap up top while the action zone is cramped.
6. **No orphan floaters** — every element has a clear owner. Raise-preview attaches to the slider; dealer button sits by its seat. Nothing hovers in undefined space.

---

## 12. Game states to lay out (not just "my turn")

| State | What changes |
|---|---|
| My turn | Action bar active; turn timer on my seat; bet-sizing available |
| Opponent's turn | Action bar idle/disabled; timer on their seat; "thinking" affordance |
| All-in | Stacks committed; bet rows collapse; emphasis on pot + odds |
| Showdown / reveal | Both hole cards up; winning hand highlighted; board fully dealt |
| Win / loss | Pot animates to winner; result banner; rating / chip delta |
| Between hands | Cards cleared; dealer button moves; "next hand" affordance |
| Waiting / reconnect | Opponent absent; countdown/spinner without breaking the frame |

---

## 13. Do / Don't

**Do**
- Position every Group-A element relative to the table surface, from normalized data.
- Keep the action bar in the thumb zone, flex-docked to the bottom.
- Drive cards / chips / pot / names from state — never from art.
- Size the player's hole cards largest.
- Respect safe-area insets for all chrome.
- Author once at the reference canvas; scale the stage as one unit.
- Validate the composition against a 16:9 screen.

**Don't**
- Bake the table, cards, or any number into a background image.
- Stretch one full-scene image across different aspect ratios.
- Give the two seats different layouts.
- Let chrome (or the slider) ride the table's scale factor.
- Let the decorative border overlap the live play region.
- Hard-code pixel positions against the background raster.

---

## 14. Lobby / login screen (separate from the table)

The lobby is a **backdrop for stacked UI** (logo, Play/Profile, login fields), not the felt.

- Same layering discipline: background image fills the viewport; **UI is components on top**, never baked in.
- The background wants a **calm, darker vertical center column** so stacked UI stays legible. Add a **legibility scrim** (gradient, darker toward the lower-center) under the form.
- Respect top (status bar) and bottom (nav) safe areas.
- Keep any wooden "Poker Monkey" sign **textless** in the art — overlay the real wordmark crisply as a component (image models mangle lettering).

---

## 15. Asset slicing (for the painterly art style)

- **Wood / scene** → one large cover texture (or seamless tile); compresses well, can be lower-res.
- **Corner foliage / crate / barrel / lantern** → individual transparent PNGs, placed by code.
- **Table rail / oval** → transparent PNG to keep the painterly look, **or** SVG (`react-native-svg`) if you'll trade richness for being infinitely crisp + recolorable for theming.
- **Nothing dynamic** in any asset.

---

### How to use this doc
Treat **§1–6** as architecture constraints (groups, layers, the one-stage strategy, the coordinate schema, table sizing) and **§11–13** as a layout acceptance checklist. Build the layer scaffold + Group-A composition first with placeholder boxes, confirm it scales and survives 16:9, then fill in real components and art.
