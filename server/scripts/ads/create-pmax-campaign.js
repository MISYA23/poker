/**
 * Creates a Performance Max campaign for Poker Monkey targeting website traffic.
 * Campaign is created PAUSED — review assets in Google Ads UI before enabling.
 *
 * Prerequisites (all in server/.env):
 *   GOOGLE_ADS_DEVELOPER_TOKEN  — from Google Ads UI → Tools → API Center
 *   GOOGLE_ADS_CLIENT_ID        — from Google Cloud Console OAuth2 credentials
 *   GOOGLE_ADS_CLIENT_SECRET    — same
 *   GOOGLE_ADS_REFRESH_TOKEN    — from running setup-oauth.js
 *   GOOGLE_ADS_CUSTOMER_ID      — your Google Ads account ID, digits only (no dashes)
 *
 * Optional (for manager/MCC accounts):
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID — the MCC account ID
 *
 * Usage:
 *   node server/scripts/ads/create-pmax-campaign.js
 *
 * Image assets (MARKETING_IMAGE, SQUARE_MARKETING_IMAGE, LOGO) are required
 * for the campaign to serve. Add your image URLs to the IMAGES section below,
 * then uncomment the image upload block.
 */

'use strict';

const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { GoogleAdsApi, enums } = require('google-ads-api');

// ── Config ────────────────────────────────────────────────────────────────────

const CUSTOMER_ID  = process.env.GOOGLE_ADS_CUSTOMER_ID;   // digits only, e.g. "1234567890"
const FINAL_URL    = 'https://poker-production-d726.up.railway.app';
const CAMPAIGN_NAME = 'Poker Monkey — PMax — Web Traffic';
const DAILY_BUDGET = 10;  // USD per day

// ── Ad Copy ───────────────────────────────────────────────────────────────────
// Limits: headline ≤30 chars, long_headline ≤90, description ≤90
// Need: ≥3 headlines, ≥1 long headline, ≥2 descriptions

const HEADLINES = [
  'Play Poker Online Now',         // 21
  "1v1 Texas Hold'em",            // 17
  'Free Heads-Up Poker',           // 20
  'Earn ELO. Beat the World.',     // 25
  'Find a Match in Seconds',       // 24
  'Real Opponents. No Bots.',      // 25
];

const LONG_HEADLINES = [
  "Challenge real players in 1v1 Texas Hold'em — free to play",    // 59
  'Track your ELO rating and dominate heads-up poker online',       // 56
];

const DESCRIPTIONS = [
  'Real-time 1v1 poker matchmaking. Find an opponent instantly. Free to play.',   // 73
  'Earn ELO ratings, track match history, and sharpen your heads-up poker game.', // 77
  'Queue up and get matched in seconds — no bots, just real opponents.',           // 68
];

// ── Images ────────────────────────────────────────────────────────────────────
// Provide public URLs for your images. The script downloads and uploads them.
// Comment out any you don't have yet — but the campaign won't serve without
// at least one MARKETING_IMAGE, one SQUARE_MARKETING_IMAGE, and one LOGO.
//
// Recommended sizes:
//   Landscape (1.91:1): 1200×628 px minimum
//   Square (1:1):        1200×1200 px minimum
//   Logo (1:1):          1200×1200 px minimum (or 512×128 for landscape logo)

const IMAGES = [
  // {
  //   url:       'https://your-domain.com/images/poker-landscape.png',
  //   fieldType: enums.AssetFieldType.MARKETING_IMAGE,
  //   label:     'landscape',
  // },
  // {
  //   url:       'https://your-domain.com/images/poker-square.png',
  //   fieldType: enums.AssetFieldType.SQUARE_MARKETING_IMAGE,
  //   label:     'square',
  // },
  // {
  //   url:       'https://your-domain.com/images/logo.png',
  //   fieldType: enums.AssetFieldType.LOGO,
  //   label:     'logo',
  // },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const lib = imageUrl.startsWith('https') ? https : require('http');
    lib.get(imageUrl, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (!CUSTOMER_ID) throw new Error('GOOGLE_ADS_CUSTOMER_ID not set in server/.env');

  const client = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });

  const customerConfig = {
    customer_id:   CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    customerConfig.login_customer_id = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  }

  const customer = client.Customer(customerConfig);
  const cid = CUSTOMER_ID;

  // Temporary resource names use negative IDs — they're resolved in one atomic mutate call.
  const budgetRn     = `customers/${cid}/campaignBudgets/-1`;
  const campaignRn   = `customers/${cid}/campaigns/-2`;
  const assetGroupRn = `customers/${cid}/assetGroups/-3`;

  const operations = [];
  let nextAssetId = -10;

  // 1. Budget
  operations.push({
    _resource:   'CampaignBudget',
    _operation:  'create',
    resource_name:    budgetRn,
    name:             `${CAMPAIGN_NAME} — Budget`,
    amount_micros:    DAILY_BUDGET * 1_000_000,
    delivery_method:  enums.BudgetDeliveryMethod.STANDARD,
    explicitly_shared: false,
  });

  // 2. Campaign
  operations.push({
    _resource:  'Campaign',
    _operation: 'create',
    resource_name:            campaignRn,
    name:                     CAMPAIGN_NAME,
    advertising_channel_type: enums.AdvertisingChannelType.PERFORMANCE_MAX,
    status:                   enums.CampaignStatus.PAUSED,   // review before enabling
    campaign_budget:          budgetRn,
    maximize_conversions:     { target_cpa_micros: 0 },      // unconstrained, maximise clicks
  });

  // 3. Asset group
  operations.push({
    _resource:  'AssetGroup',
    _operation: 'create',
    resource_name: assetGroupRn,
    name:          'Poker Monkey — Main',
    campaign:      campaignRn,
    final_urls:    [FINAL_URL],
    status:        enums.AssetGroupStatus.ENABLED,
  });

  // 4. Text assets
  const textAssets = [
    ...HEADLINES.map((text) => ({ text, fieldType: enums.AssetFieldType.HEADLINE })),
    ...LONG_HEADLINES.map((text) => ({ text, fieldType: enums.AssetFieldType.LONG_HEADLINE })),
    ...DESCRIPTIONS.map((text) => ({ text, fieldType: enums.AssetFieldType.DESCRIPTION })),
  ];

  for (const { text, fieldType } of textAssets) {
    const assetRn = `customers/${cid}/assets/${nextAssetId}`;
    nextAssetId--;

    operations.push({
      _resource:   'Asset',
      _operation:  'create',
      resource_name: assetRn,
      text_asset:    { text },
    });
    operations.push({
      _resource:   'AssetGroupAsset',
      _operation:  'create',
      asset_group: assetGroupRn,
      asset:       assetRn,
      field_type:  fieldType,
    });
  }

  // 5. Image assets (uncomment IMAGES array entries above to enable)
  if (IMAGES.length > 0) {
    console.log(`Downloading ${IMAGES.length} image(s)...`);
    for (const img of IMAGES) {
      const data   = await downloadImageAsBase64(img.url);
      const assetRn = `customers/${cid}/assets/${nextAssetId}`;
      nextAssetId--;

      operations.push({
        _resource:   'Asset',
        _operation:  'create',
        resource_name: assetRn,
        image_asset:   { data },
      });
      operations.push({
        _resource:   'AssetGroupAsset',
        _operation:  'create',
        asset_group: assetGroupRn,
        asset:       assetRn,
        field_type:  img.fieldType,
      });
      console.log(`  ✓ ${img.label}`);
    }
  } else {
    console.log('⚠️  No image assets configured — campaign will be incomplete until images are added.');
    console.log('   Populate the IMAGES array at the top of this file and re-run, or upload images');
    console.log('   manually in the Google Ads UI after creation.\n');
  }

  // 6. Fire
  console.log(`Sending ${operations.length} operations to Google Ads API...`);
  const result = await customer.mutateResources(operations);

  console.log('\n✅ Campaign created (PAUSED)!');
  console.log('Resource names:');
  result.mutate_operation_responses?.forEach((r, i) => {
    const rn = Object.values(r)[0]?.resource_name;
    if (rn) console.log(`  [${i}] ${rn}`);
  });
  console.log('\nNext: add image assets in Google Ads UI, then set campaign status to ENABLED.');
}

run().catch((err) => {
  console.error('Error:', err.message || err);
  if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
