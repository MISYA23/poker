# ⚠️ PINNED TO EXPO SDK 54 — DO NOT UPGRADE

This app ships through the Play Store **Expo Go runtime, which only supports SDK 54**.
SDK 56 packages crash the app on launch. Do **not** upgrade `expo` or any `expo-*`
package past its SDK 54 version.

## Watch out for `expo-asset` / `expo-constants` creeping to SDK 56

`expo-audio@1.1.1` declares a loose peer dependency `"expo-asset": "*"`. npm
auto-installs the *latest* published version to satisfy it — which is the SDK 56
build (`expo-asset@56.x`, pulling `expo-constants@56.x`). Those get hoisted to the
top of `node_modules`, Expo autolinking compiles their native `AssetModule`
against the SDK 54 runtime, and the app dies at launch with:

```
java.lang.NoClassDefFoundError at expo.modules.asset.AssetModule.definition
```

(This silently broke alpha build versionCode 14 — ~100% crash rate, no JS error.)

**The guard:** `package.json` pins these via `overrides`:

```json
"overrides": {
  "expo-asset": "~12.0.13",
  "expo-constants": "~18.0.13"
}
```

Keep that block. After any dependency change, verify with:

```bash
npm ls expo-asset expo-constants   # must be 12.0.13 / 18.0.13, never 56.x
```
