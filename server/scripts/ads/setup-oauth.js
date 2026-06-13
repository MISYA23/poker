/**
 * Run this ONCE to get your Google Ads OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Google Cloud Console → create a project → enable "Google Ads API"
 *   2. OAuth2 credentials → Desktop app → download client_id + client_secret
 *   3. Add to server/.env:
 *        GOOGLE_ADS_CLIENT_ID=...
 *        GOOGLE_ADS_CLIENT_SECRET=...
 *
 * Usage:
 *   node server/scripts/ads/setup-oauth.js
 *
 * Then open the printed URL, authorize, and the refresh token prints in the terminal.
 * Add it to server/.env as GOOGLE_ADS_REFRESH_TOKEN=...
 */

'use strict';

const http = require('http');
const url  = require('url');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const CLIENT_ID     = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const PORT          = 8371;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;
const SCOPE         = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in server/.env');
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on port', PORT, '...\n');

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  if (pathname !== '/callback') { res.end('Not found'); return; }

  const code = query.code;
  if (!code) {
    res.end('<h2>Error: no code in callback</h2>');
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
      code,
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    res.end('<h2>Error — no refresh_token returned. Try revoking app access and re-running.</h2>');
    console.error('Response:', tokens);
    server.close();
    return;
  }

  res.end('<h1 style="font-family:sans-serif">Done! Check your terminal.</h1>');
  console.log('\n✅ Refresh token:', tokens.refresh_token);
  console.log('\nAdd this to server/.env:');
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  server.close();
});

server.listen(PORT);
