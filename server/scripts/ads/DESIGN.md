# Google Ads API — Design Doc

## Goal

Run paid acquisition campaigns for Poker Monkey programmatically via the Google Ads API. Phase 1 targets website traffic (web app signups). Phase 2 will add app install campaigns once the mobile app is on the Play Store / App Store.

---

## Account Structure

```
Manager Account (MCC)
└── Poker Monkey — 366-039-9537   ← all campaigns live here
```

The developer token belongs to the Manager account. All API calls target the advertiser account (`GOOGLE_ADS_CUSTOMER_ID=3660399537`). The `login_customer_id` env var holds the Manager account ID and is passed as a header on every request.

---

## Credentials

| Env var | Where it comes from |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Manager account → Tools → API Center |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console → OAuth2 credentials (Desktop app) |
| `GOOGLE_ADS_CLIENT_SECRET` | same |
| `GOOGLE_ADS_REFRESH_TOKEN` | run `setup-oauth.js` once |
| `GOOGLE_ADS_CUSTOMER_ID` | advertiser account ID, digits only |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Manager account ID, digits only |

OAuth scope: `https://www.googleapis.com/auth/adwords`

---

## Phase 1 — Performance Max, Website Traffic

**Campaign type:** `PERFORMANCE_MAX`  
**Goal:** drive signups at `poker-production-d726.up.railway.app`  
**Bidding:** `MAXIMIZE_CONVERSIONS` (unconstrained until conversion data accumulates, then add `target_cpa_micros`)  
**Budget:** $10/day to start, adjustable in config  
**Status on creation:** `PAUSED` — review assets in UI before enabling

### Asset group structure

```
Campaign: Poker Monkey — PMax — Web Traffic
└── Asset Group: Poker Monkey — Main
    ├── Headlines (6)        ← 30 char max each
    ├── Long headlines (2)   ← 90 char max each
    ├── Descriptions (3)     ← 90 char max each
    ├── Landscape image      ← 1200×628 min, MARKETING_IMAGE
    ├── Square image         ← 1200×1200 min, SQUARE_MARKETING_IMAGE
    └── Logo                 ← 1200×1200 min, LOGO
```

Images are downloaded from public URLs and uploaded as base64 in the same `mutateResources` batch call.

### Mutation order (single atomic call)

All resources are created in one `customer.mutateResources([...])` call using temporary negative resource IDs that resolve in order:

1. `CampaignBudget` → `-1`
2. `Campaign` → `-2` (references `-1`)
3. `AssetGroup` → `-3` (references `-2`)
4. `Asset` (text) × N → `-10, -11, ...`
5. `AssetGroupAsset` × N (links each asset to `-3`)
6. `Asset` (image) × N (if IMAGES array populated)
7. `AssetGroupAsset` × N (links image assets to `-3`)

---

## Phase 2 — App Install Campaigns (future)

App campaigns (`APP_INSTALL`) are a separate campaign type and cannot be mixed with PMax. They require:
- App registered on Play Store or App Store
- App linked to the Google Ads account
- `app_id` and `app_store` set on the campaign

A separate script `create-app-campaign.js` will handle this. Same credential setup, same account.

---

## Scripts

| Script | Purpose | Run |
|---|---|---|
| `setup-oauth.js` | One-time OAuth flow → prints refresh token | `node server/scripts/ads/setup-oauth.js` |
| `create-pmax-campaign.js` | Creates Phase 1 PMax campaign | `node server/scripts/ads/create-pmax-campaign.js` |

---

## npm dependency

`google-ads-api` (Opteo) — installed as `devDependency` in `server/package.json`. Not loaded by the production server — scripts are run locally only.

---

## What's NOT in code (managed in UI)

- Audience signals (add after launch once you have remarketing data)
- Conversion actions (set up Google tag on the web app → fire on signup)
- Budget changes after launch
- Pausing / enabling campaigns
- Negative keyword lists

---

## Rollout plan

1. ✅ Developer token obtained
2. ☐ OAuth credentials (Cloud Console)
3. ☐ Refresh token (`setup-oauth.js`)
4. ☐ Source images (landscape + square screenshot of app, logo)
5. ☐ Run `create-pmax-campaign.js`
6. ☐ Review assets in Google Ads UI
7. ☐ Set up conversion tracking (Google tag → signup event)
8. ☐ Enable campaign
9. ☐ (Phase 2) App Store listing → `create-app-campaign.js`
