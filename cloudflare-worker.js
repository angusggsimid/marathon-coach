/**
 * Cloudflare Worker — Intervals.icu CORS Proxy
 *
 * Deploy:
 *   1. Go to https://workers.cloudflare.com → Create Worker
 *   2. Paste this file → Save & Deploy
 *   3. (Recommended) Bind env vars:
 *        ALLOWED_ORIGINS = https://marathon-pi-seven.vercel.app,http://localhost:5173,http://127.0.0.1:5173
 *      Comma-separated. Never use "*".
 *   4. Add to app .env:  VITE_ICU_PROXY=https://your-worker.workers.dev
 *   5. Rebuild the app: npm run build
 *
 * The worker forwards requests to intervals.icu and adds CORS headers.
 * It never stores credentials — the Authorization header passes through as-is.
 * Only /api/v1/* paths are proxied (blocks open proxy abuse).
 */

const TARGET = 'https://intervals.icu';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']);

/** Default allowlist when env.ALLOWED_ORIGINS is unset (production + local dev). */
const DEFAULT_ALLOWED = [
  'https://marathon-pi-seven.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

/**
 * @param {any} env
 * @returns {string[]}
 */
function getAllowedOrigins(env) {
  const raw = env && typeof env.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS.trim() : '';
  if (!raw) return DEFAULT_ALLOWED;
  // Explicitly reject wildcard
  if (raw === '*') return DEFAULT_ALLOWED;
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== '*');
}

/**
 * @param {Request} request
 * @param {string[]} allowed
 * @returns {string|null} echo origin if allowed, else null
 */
function resolveAllowOrigin(request, allowed) {
  const origin = request.headers.get('Origin');
  // No Origin (same-origin navigation, curl, server-to-server): do not echo "*"
  if (!origin) return null;
  if (allowed.includes(origin)) return origin;
  return null;
}

/**
 * @param {string|null} allowOrigin
 */
function corsHeaders(allowOrigin) {
  /** @type {Record<string, string>} */
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (allowOrigin) {
    h['Access-Control-Allow-Origin'] = allowOrigin;
    h['Vary'] = 'Origin';
  }
  return h;
}

/**
 * Only proxy Intervals.icu public API under /api/v1/
 * @param {string} pathname
 */
function isAllowedPath(pathname) {
  if (!pathname.startsWith('/api/v1/')) return false;
  // Block path traversal / weird encodings
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('%2e') || pathname.includes('%2E')) {
    return false;
  }
  // Athlete calendar events (sync) + optional athlete profile read
  // /api/v1/athlete/{id}/events
  // /api/v1/athlete/{id}
  if (/^\/api\/v1\/athlete\/[A-Za-z0-9_-]+(\/events)?$/.test(pathname)) return true;
  return false;
}

/**
 * @param {number} status
 * @param {string} message
 * @param {string|null} allowOrigin
 */
function jsonError(status, message, allowOrigin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(allowOrigin),
    },
  });
}

export default {
  /**
   * @param {Request} request
   * @param {{ ALLOWED_ORIGINS?: string }} env
   */
  async fetch(request, env) {
    const allowed = getAllowedOrigins(env);
    const allowOrigin = resolveAllowOrigin(request, allowed);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      // Disallowed / missing Origin: 204 without ACAO (browser will block)
      return new Response(null, {
        status: 204,
        headers: corsHeaders(allowOrigin),
      });
    }

    // Method check
    if (!ALLOWED_METHODS.has(request.method)) {
      return jsonError(405, 'Method not allowed', allowOrigin);
    }

    // Disallowed Origin for real requests
    if (request.headers.get('Origin') && !allowOrigin) {
      return jsonError(403, 'Origin not allowed', allowOrigin);
    }

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return jsonError(400, 'Invalid request URL', allowOrigin);
    }

    if (!isAllowedPath(url.pathname)) {
      return jsonError(404, 'Path not allowed. Only /api/v1/athlete/{id}[/events] is proxied.', allowOrigin);
    }

    // Athlete id length guard (Intervals.icu ids are short, e.g. i12345)
    const athleteMatch = url.pathname.match(/^\/api\/v1\/athlete\/([A-Za-z0-9_-]+)/);
    if (athleteMatch && athleteMatch[1].length > 32) {
      return jsonError(400, 'Invalid athlete id', allowOrigin);
    }

    const targetURL = TARGET + url.pathname + url.search;

    // Forward only needed headers — never strip Authorization (pass-through)
    const forwardHeaders = new Headers();
    const auth = request.headers.get('Authorization');
    const contentType = request.headers.get('Content-Type');
    if (auth) forwardHeaders.set('Authorization', auth);
    if (contentType) forwardHeaders.set('Content-Type', contentType);
    forwardHeaders.set('Accept', 'application/json');

    try {
      const forwarded = new Request(targetURL, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      const response = await fetch(forwarded);

      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) {
        newResponse.headers.set(k, v);
      }
      // Do not leak proxy internals
      newResponse.headers.delete('Set-Cookie');
      return newResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream fetch failed';
      return jsonError(502, `Proxy error: ${msg}`, allowOrigin);
    }
  },
};
