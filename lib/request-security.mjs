/** Validate browser-origin evidence for state-changing application requests. */
export function sameOrigin(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const expected = new URL(req.url).origin;
  const origin = req.headers.get('origin');
  if (origin !== null) return origin === expected;
  const referer = req.headers.get('referer');
  if (!referer) return false;
  try { return new URL(referer).origin === expected; } catch { return false; }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/** Preserve response-specific policies, such as the stricter image CSP. */
export function secureResponse(request, response, development = false) {
  // Cloudflare WebSocket upgrade responses carry a socket outside the body.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  if (!development && !headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', contentSecurityPolicy);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
