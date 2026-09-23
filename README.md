# Tari Ootle Liquidity Protocol

A public, permissionless, non-custodial liquidity protocol for Tari Ootle.

## What this is
- Non-custodial AMM for fungible Ootle assets.
- Native Tari support (P0 Experimental).
- Permissionless pool factory (no admin withdrawal, no upgrade keys).
- Static web frontend deployable to GitHub Pages.
- Wallet adapter interface supporting browser extension, embedded mobile, walletd, and Sapient (adapter interface only).

## What this is NOT
- Not a centralized exchange.
- Not a custody service.
- Not an audited mainnet product.
- Not a guaranteed legal safe harbor.
- Not a private/confidential AMM (pool reserves are public by design).

## Current status

| Priority | Route | Status |
|----------|-------|--------|
| P0 | Public Fungible / Tari Native | Experimental |
| P1 | Public Fungible / Public Fungible | Experimental |
| P2 | Stealth / Tari Native | Blocked (privacy disclosure required) |
| P2 | Stealth / Public Fungible | Blocked |
| P3 | Wrapped Stablecoin / Tari | Blocked (upstream admin controls must be excluded) |
| P3 | Private Stablecoin Direct / Public | Blocked |
| P4 | NFT Collection / Tari Native | Blocked (separate non-fungible design needed) |

## Architecture
- `crates/pool_math`: integer constant-product AMM math (no floats).
- `crates/protocol_types`: resource identifiers, fee tiers, route matrix.
- `packages/wallet-adapter`: adapter interface + implementations.
- `packages/protocol-client`: indexer/network abstraction.
- `packages/ootle-wallet-core`: SDK wrapper (scaffold).
- `packages/ui-components`: shared React components (scaffold).
- `apps/web`: static React/Vite frontend.
- `apps/extension`: browser extension signer scaffold.
- `apps/mobile`: Capacitor mobile scaffold.
- `docs/`: design, security, upstream reference, audit checklist.

## Build and test

### Rust
```bash
# Build and test pool math
cargo test --manifest-path crates/pool_math/Cargo.toml
```

### TypeScript
```bash
# Install dependencies
pnpm install

# Type check
pnpm typecheck

# Build web
pnpm --filter @tari-ootle/web build
```

### Build verification
```bash
# Verify static output
ls apps/web/dist/
# Verify extension manifest
cat apps/extension/manifest.json
# Verify no secrets in build
find apps/web/dist -type f | head -20
```

## Security status
- Non-custodial architecture: user controls keys.
- No admin withdrawal mechanism in design.
- No protocol trading fee (0% developer fee).
- No upgrade mechanism for deployed pools.
- Wallet adapter requires independent transaction preview before signing.
- CSP configured for static site.
- Dependencies pinned; lock files committed.

## Security findings / known issues
- TariSwap upstream uses `AccessRules::allow_all()` in test templates; our production templates must implement strict access rules.
- First-deposit vulnerability exists if tiny initial liquidity allows ratio manipulation; minimum liquidity lock is recommended but not yet enforced.
- Stealth/confidential routes reveal amounts at the AMM boundary; privacy claims must explicitly state this.
- No formal smart contract audit completed.
- No mainnet deployment yet; target is Esmeralda testnet.

## Wallet adapter status
- BrowserExtensionWalletAdapter: implemented (requires extension installation).
- EmbeddedOotleWalletAdapter: implemented (requires SDK wiring).
- SapientWalletAdapter: adapter interface with explicit unsupported errors; stable public dApp API is missing upstream.
- WalletDaemonAdapter: implemented for development/testing.

## Upstream versions inspected
- tari-ootle (development branch, 2026-09-22)
- tari-cli (main, 2026-09-22)
- stable-coin (main, 2026-09-22)
- @chironbuilder/ootle-sdk 0.1.11 (npm, published ~6 days before inspection)
- TariSwap source: `crates/engine/tests/templates/tariswap/src/lib.rs` (BSD-3-Clause)

## Licensing
- Protocol code: MIT
- @chironbuilder/ootle-sdk dependency: MIT (not copied; referenced only)
- Upstream Tari code references: BSD-3-Clause (not copied; referenced in docs only)
- Sapient wallet reference: PolyForm Noncommercial (not copied; adapter interface only)

## Documentation
- `docs/ARCHITECTURE.md`
- `docs/SECURITY_MODEL.md`
- `docs/THREAT_MODEL.md`
- `docs/LEGAL_DESIGN.md`
- `docs/UPSTREAM_BASELINE.md`
- `docs/TARISWAP_REFERENCE.md`
- `docs/THIRD_PARTY_LICENSES.md`
- `docs/NFT_DESIGN.md`
- `docs/STEALTH_ASSET_DESIGN.md`
- `docs/STABLECOIN_INTEGRATION.md`
- `docs/SAPIENT_INTEGRATION.md`
- `docs/EXTENSION_SECURITY.md`
- `docs/MOBILE_SECURITY.md`
- `docs/GITHUB_PAGES.md`
- `docs/TESTNET_RUNBOOK.md`
- `docs/AUDIT_CHECKLIST.md`
- `docs/ROUTE_MATRIX.md`

## Next best task
1. Deploy a test pool component to Esmeralda using tari-cli.
2. Verify swap/add/remove liquidity cycle with wallet adapter connected.
3. Complete security audit checklist items for P0 before any mainnet consideration.
4. Implement minimum liquidity lock or initial deposit protection.
