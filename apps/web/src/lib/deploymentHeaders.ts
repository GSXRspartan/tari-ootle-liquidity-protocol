/**
 * Deployment response headers.
 *
 * A meta CSP silently ignores `frame-ancestors`, so the clickjacking protection
 * has to come from a real response header. This file is the single source of
 * truth for those headers, it is asserted by the test suite, and it is written
 * to `dist/_headers` by a post-build step so a static host (GitHub Pages,
 * Cloudflare Pages, Netlify) serves it verbatim.
 *
 * The trusted embedding origin is the Tari wallet's own dApp frame. A dApp is
 * reached through the provider injected into THIS page, so the same-origin
 * allowance is what actually matters; the wallet origin is listed for the
 * iframe-based dApp model described in
 * docs/TARI_BROWSER_ATOMIC_SWAP_PROVIDER_GAP.md.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' https://indexer.esmeralda.tari.com https://indexer-fallback.tari.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self' https://universe.tari.mw",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY_HEADERS: ReadonlyArray<{ name: string; value: string; why: string }> = [
  {
    name: 'Content-Security-Policy',
    value: CONTENT_SECURITY_POLICY,
    why: 'The script and connect policy is the real control. frame-ancestors lives here, not in a meta tag, because a meta CSP ignores it.',
  },
  {
    name: 'X-Content-Type-Options',
    value: 'nosniff',
    why: 'Stops a browser from re-interpreting a response as a script type it was not served as.',
  },
  {
    name: 'Referrer-Policy',
    value: 'no-referrer',
    why: 'Pool and NFT URLs carry resource addresses; a referrer must not leak them to a third party.',
  },
  {
    name: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
    why: 'This app requests none of these. Denying them removes a permission-prompt phishing surface.',
  },
  {
    name: 'X-Frame-Options',
    value: 'SAMEORIGIN',
    why: 'Legacy clickjacking defence for browsers that ignore CSP frame-ancestors. Note this also blocks the wallet iframe, so it must be reconciled with frame-ancestors if the iframe dApp model is used - recorded as a residual risk.',
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups',
    why: 'Isolates the browsing context from an opener while still allowing a user-initiated popup, so window.opener cannot be used to reach this app.',
  },
  {
    name: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
    why: 'The built assets are not useful to another origin, and loading them cross-origin would leak which pool a user is viewing.',
  },
];

/** Render the headers in the `_headers` format used by several static hosts. */
export function renderHeadersFile(): string {
  const lines = ['/*', '  Security headers. See apps/web/src/lib/deploymentHeaders.ts and', '  docs/FRONTEND_SECURITY_MODEL.md for the reasoning behind each.', ''];
  for (const header of SECURITY_HEADERS) {
    lines.push(`${header.name}: ${header.value}`);
  }
  lines.push('', '/assets/*', '  Cache-Control: public, max-age=31536000, immutable');
  return `${lines.join('\n')}\n`;
}
