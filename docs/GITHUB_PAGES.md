# GITHUB PAGES

## Deployment
- Build static frontend: `npm run build` in `apps/web`.
- Output: `apps/web/dist/` (HTML, JS, CSS only).
- Deploy using `.github/workflows/pages.yml`.

## Security for hosted site
- All bundled JavaScript is PUBLIC. No secrets in build.
- CSP header enforced: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://indexer.*`.
- No remote executable scripts.
- Dependency pinning: lock files committed.
- No analytics, no tracking scripts.
- Custom domain: configure via GitHub Pages settings; HTTPS enforced.

## Signing boundary on hosted site
- User must have browser extension installed to sign.
- Mobile users connect through deep-link or separate mobile app.
- Website never receives private keys or seed phrases.
- Wallet adapter interface ensures independent transaction preview.

## Build verification
- Verify `dist/index.html` exists and references only local assets.
- Verify no `.env` or secret files present in `dist/`.
- Verify `manifest.json` and extension build are separate from web build.
