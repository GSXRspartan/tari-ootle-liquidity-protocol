# Frontend and browser residual risks

What the audit did **not** establish. These are not open code defects — each was
traced to a boundary outside this repository, or to a decision that was taken
deliberately and is recorded here so it is not mistaken for a solved problem.

Severity is the consequence if the risk materialises, not the likelihood.

| ID | Risk | Severity | Status | Why it is not closed here |
|---|---|---|---|---|
| **R-1** | **The security response headers are generated but not delivered by the current deployment.** The build emits `dist/_headers` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`, COOP, CORP) and CI asserts the file exists. GitHub Pages does not read `_headers`; that is a Netlify/Cloudflare convention. On Pages, the page is served with none of them. | HIGH | OPEN — external | Fixing it means changing the host, not the app. The honest options are: move Pages behind a proxy or CDN that can set headers, or accept the gap and record it. `docs/GITHUB_PAGES.md` is the place to decide. |
| **R-2** | **`https://universe.tari.mw` in `frame-ancestors` is unverified.** It was written into the emitted header and the `index.html` comment. Nothing in this repository establishes that it is the wallet's origin, and an allow-list nobody has confirmed is a policy that may silently exclude the real wallet while admitting an assumed one. | MEDIUM | OPEN — needs confirmation | Requires a statement of the embedding origin from the wallet team. Until then the value is an assumption, and it is treated as one here. |
| **R-3** | **Browser-side atomic SHA swaps do not exist upstream.** The capability check reports the blocker and there is deliberately no walletd fallback, so the multi-hop route cannot be completed in a browser. | HIGH | BLOCKED_EXTERNAL | Upstream. Recorded so the gap is not read as an untested feature. `security/MINOTARI_AUTHORITY_MODEL.md`. |
| **R-4** | **No live wallet, indexer, or chain was contacted.** Every provider interaction was an injected double, and the indexer was intercepted at its production origin. Nothing here is evidence about the real behaviour of a real Minotari build, a real indexer, or real transaction confirmation timing. | HIGH | OPEN by environment | No credentials, no funded wallet, no reachable Esmeralda endpoint in this environment. |
| **R-5** | **`UNKNOWN` reconciliation is implemented but unexercised end to end.** The rule is proven by unit tests and by a UI assertion that no retry control exists. No operation has actually reached `UNKNOWN` from a real lost submission response and been reconciled by durable identifier. | MEDIUM | OPEN by environment | Requires a real submission whose response is lost. |
| **R-6** | **Source maps are published deliberately.** They expose bundle structure and original source to anyone who loads the app. The decision is recorded in `dist/SOURCE_MAP_POLICY.txt` and treated as non-security-critical on the grounds that the app holds no secrets — which is true *today* and would change if it ever did. | LOW | ACCEPTED, with a stated condition | Reversible in one build flag. Re-open if any secret-bearing code is ever reachable from the frontend. |
| **R-7** | **The `style-src 'unsafe-inline'` directive is required by the current React code**, which sets layout styles as style attributes. There is no CSS-injection vector today because no untrusted value reaches a style property, but the directive removes a whole class of future bug. | LOW | ACCEPTED, with a condition | Removing it requires moving layout to classes, which is a refactor rather than a security fix. It is a live constraint on future work. |
| **R-8** | **Pool reserves are public by design**, so a submitted transaction's amounts are visible before settlement. For an XTM/TARI multi-hop route, the intermediate amount is therefore observable. | MEDIUM | ACCEPTED by design | A property of the AMM, not a defect. The privacy disclosure in the signing context exists to state it rather than hide it. |
| **R-9** | **Firefox coverage is CI-only.** The Playwright Firefox build is not installed on the developer machine used for this audit, and on that host its software WebRender exhausts memory across a full suite run (`wr_renderer_render: OutOfMemory`), failing a different test each time by contention rather than by behaviour. Firefox is therefore verified on CI runners only, and has not been observed green locally. | LOW | ACCEPTED, tracked | `test:e2e` runs Chromium (desktop + mobile); `test:e2e:all` adds Firefox and is what CI runs. Forcing Firefox's basic compositor did not fix the memory exhaustion and was reverted. |
| **R-10** | **Only three browser engines and one viewport pair were exercised.** Chromium and Firefox at 1440x900, plus Chromium at a mobile viewport. No WebKit, no real iOS or Android device, no screen reader, no high-contrast or reduced-motion mode, and no automated axe pass. | MEDIUM | OPEN | `test:e2e:install` would need WebKit added, and device coverage needs real hardware. The accessibility assertions are behavioural, not exhaustive. |
| **R-11** | **The test suite is the specification of what was checked, and a check that was not written is a check that did not happen.** The clearest evidence is finding F-01 below: a well-tested validator was not on the live path while 179 tests passed. | MEDIUM | ONGOING, structural | Mitigation is the browser suite and the wiring assertions added with F-01, but the failure mode is inherent to module-level testing. Treat any new security module as unwired until an end-to-end flow exercises it. |
| **R-12** | **Two lockfiles coexist.** `pnpm-lock.yaml` is now committed and authoritative, but a historical `package-lock.json` also remains tracked in the repository root. | LOW | OPEN | Not a vulnerability, but an ambiguous install path for anyone who runs `npm install`. Should be deleted in a dedicated change so the removal is reviewable on its own. |

---

## F-01: the validator that was not on the path

Recorded separately because it is the audit's most transferable result, and
because it is the reason R-11 exists.

`apps/web/src/lib/storage.ts` contained a strict, fail-closed record validator:
it bounds its input, rebuilds every record from an allow-list, rejects a
malformed amount outright, drops records carrying secret fields, and caps the
record count. It was correct, and it was well tested — `storage: a tampered
amount, resource, or txid is dropped rather than coerced`, `storage: a record
carrying a secret field is dropped outright`, and a dozen more.

Those tests called `loadHistoryPayload` **directly**. The application never did.

The live read path, `apps/web/src/services/history.ts`, parsed `localStorage`
itself and filtered records with `typeof entry.operationId === 'string'`. So in
the shipped app:

- a record whose amounts had been tampered with rendered verbatim,
  `amounts: { a: 'not-a-number' }` displayed as the literal text `not-a-number`;
- an unrecognised field, including a `preimage` written by an older build,
  survived into application state;
- the input was unbounded, so a large payload was parsed in full;
- `historyIntegrity` reported "not an array" or nothing at all, so the interface
  could not tell the user that records had been dropped.

The suite was **179/179 green** while this was true.

The fix routes the read path through the validator and reports the rejected
count. The durable mitigation is the wiring assertion: a test now reads
`services/history.ts` and fails if the raw filter ever reappears, and a browser
flow writes forged records to `localStorage` before app code runs and asserts
they are not displayed. That flow is the one that would have caught this
originally, and it exists now only because the module-level tests had already
proven insufficient.

**The generalisable rule: a security module's tests prove the module, not its
reachability. Prove the wiring separately, or the control is documentation.**
