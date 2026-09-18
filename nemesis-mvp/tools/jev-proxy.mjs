#!/usr/bin/env node
// Jev key proxy (AC-9.3.1): TypeSafe advises keeping API credentials
// server-side in web apps, so this tiny local proxy holds the key and the
// browser never sees it. Zero dependencies.
//
//   TYPESAFE_API_KEY=sk-... node tools/jev-proxy.mjs
//
// Optional env:
//   TYPESAFE_API_URL  upstream decision endpoint. Default below is an
//                     ASSUMPTION (docs.typesafe.ai was unreachable from
//                     the build environment) — set this to the endpoint
//                     your TypeSafe dashboard names if it differs.
//   JEV_PROXY_PORT    listen port (default 8765)

import http from 'http';

const KEY = process.env.TYPESAFE_API_KEY || '';
const UPSTREAM = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/decide';
const PORT = +(process.env.JEV_PROXY_PORT || 8765);

if (!KEY) {
  console.error('TYPESAFE_API_KEY is not set — refusing to start.');
  process.exit(1);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  // secure pages (the published artifact) calling localhost need this
  'access-control-allow-private-network': 'true',
};

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, CORS); res.end(); return; }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', async () => {
    try {
      const up = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body,
      });
      const text = await up.text();
      res.writeHead(up.status, { ...CORS, 'content-type': 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
}).listen(PORT, () => {
  console.log(`jev-proxy: http://localhost:${PORT}/decide -> ${UPSTREAM} (key held server-side)`);
});
