/**
 * Cloudflare Worker — Intervals.icu CORS Proxy
 *
 * Deploy:
 *   1. Go to https://workers.cloudflare.com → Create Worker
 *   2. Paste this file → Save & Deploy
 *   3. Copy the worker URL (e.g. https://marathon-icu-proxy.yourname.workers.dev)
 *   4. Add to .env:  VITE_ICU_PROXY=https://marathon-icu-proxy.yourname.workers.dev
 *   5. Rebuild the app: npm run build
 *
 * The worker simply forwards requests to intervals.icu and adds CORS headers.
 * It never stores credentials — the Authorization header passes through as-is.
 */

const TARGET = 'https://intervals.icu';
const ALLOWED_ORIGIN = '*'; // restrict to your domain in production if desired

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Forward to intervals.icu
    const url = new URL(request.url);
    const targetURL = TARGET + url.pathname + url.search;

    const forwarded = new Request(targetURL, {
      method:  request.method,
      headers: request.headers,
      body:    request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const response = await fetch(forwarded);

    // Clone response and add CORS headers
    const newResponse = new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers:    response.headers,
    });
    for (const [k, v] of Object.entries(corsHeaders())) {
      newResponse.headers.set(k, v);
    }
    return newResponse;
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
