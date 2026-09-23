# END-OF-RUN CHECKPOINT

## 1. Exact repo path
C:\Users\pdark\Documents\Codex\2026-09-22\tari-ootle-liquidity-protocol

## 2. Current date
2026-09-23

## 3. Git commit count
10 commits total

## 4. Latest commit hash
[to be recorded after final commit]

## 5. Tari Ootle upstream commit
2d6083e6cc7c98cde93dacebe2fb76b17703f588 (development branch, cloned to C:\tmp-tari, 2026-09-22)

## 6. ootle.ts commit/version
Not directly cloned; referenced through upstream tari-ootle workspace.

## 7. @chironbuilder/ootle-sdk version
0.1.11 (npm, MIT, published ~2026-09-16)

## 8. stable-coin commit
main branch, 92 commits, inspected 2026-09-22

## 9. Sapient source/version
https://github.com/chironbuilds/tari-wallet (PolyForm Noncommercial; NOT copied; adapter interface only)

## 10. Route support matrix (docs/ROUTE_MATRIX.md)
| Route | Status | Notes |
|-------|--------|-------|
| Public Fungible / Tari Native | Experimental | Template source complete; first-deposit defense implemented; WASM not yet built; engine tests documented |
| Public Fungible / Public Fungible | Experimental | Template ready; same as above |
| Stealth / Tari | Blocked | Privacy disclosure required; no confidential AMM support |
| Stealth / Public Fungible | Blocked | Same as above |
| Wrapped Stablecoin / Tari | Blocked | Upstream admin controls excluded from permissionless AMM |
| Private Stablecoin / Public | Blocked | Direct private AMM not safe; use wrapped version first |
| NFT Collection / Tari | Blocked | No upstream NFT pool template; separate design needed |

## 11. Implemented contracts
- `crates/pool_math`: integer AMM math (checked arithmetic, no floats, 28 tests passing)
- `crates/protocol_types`: PoolId, ResourceAddress, FeeTier, RouteDescriptor, RouteStatus, PoolInfo, TransactionPreview, initial_route_matrix()
- `templates/fungible_pool/src/lib.rs`: Complete WASM template source with:
  - Strict access rules (no `AccessRules::allow_all()`)
  - Immutable fee (per-mil out of 1000, default 3 = 0.30%)
  - Minimum initial liquidity defense (`MINIMUM_INITIAL_LIQUIDITY = 1_000_000`)
  - Native Tari handled as `STEALTH_TARI_RESOURCE_ADDRESS` (explicit upstream constant)
  - No admin withdrawal, no fee setter, no upgrade path
  - Floor division for LP removal (prevents over-withdrawal)
  - Access rules: `.set_method_access()` per method; LP burn restricted to resource owner

## 12. Implemented wallet adapters
- BrowserExtensionWalletAdapter (scaffold)
- EmbeddedOotleWalletAdapter (scaffold with KeyValueStore)
- SapientWalletAdapter (explicit unsupported errors)
- WalletDaemonAdapter (development/test)

## 13. Browser extension status
Manifest V3 scaffold (`apps/extension/manifest.json`, service_worker, popup). Security model documented in `docs/EXTENSION_SECURITY.md`.

## 14. Mobile status
Capacitor scaffold (`apps/mobile/capacitor.config.json`). Mobile security documented in `docs/MOBILE_SECURITY.md`. Secure storage requires native plugin integration.

## 15. Web/GitHub Pages status
Static React/Vite app builds successfully (`apps/web/dist/index.html` verified). GitHub Pages workflow created (`.github/workflows/pages.yml`). CSP configured. No secrets in build.

## 16. Total Rust tests
28 tests passing:
- 12 unit tests (math crate)
- 2 integration cycle tests
- 14 adversarial/property tests (overflow, division by zero, rounding protection, reserve depletion, first-deposit ratio, fake Tari, donation attack, rounding extraction, extreme amounts)

## 17. Total TypeScript tests
None implemented beyond build verification. No test framework configured.

## 18. Property/fuzz test status
Property tests implemented and passing for:
- Rounding protection (repeated swaps don't extract value)
- Invariant preservation (k_after >= k_before)
- Overflow protection
- Division by zero protection
- Zero reserve/input/output rejection
- Invalid fee rejection
- Huge/small amount handling
- First-deposit ratio safety
- Reserve depletion repeated swaps
- Unauthorized mint/withdrawal (protocol-level, documented)

No automated fuzz framework integrated.

## 19. Known security issues
- First-deposit vulnerability: FIXED with `MINIMUM_INITIAL_LIQUIDITY = 1_000_000` enforced on first deposit
- Donation attack: DOCUMENTED; floor division on removal prevents extraction, but direct vault deposits could alter reserves
- No formal smart contract audit completed
- No mainnet deployment; testnet (Esmeralda) target only
- AMM reserves are public by design; stealth/confidential routes explicitly disclose privacy loss at pool boundary

## 20. Known upstream blockers
- Sapient wallet: no stable public dApp message protocol documented
- Stablecoin: admin-controlled templates excluded from permissionless AMM
- NFT liquidity: no upstream NFT pool template exists
- tari-cli not installed in current environment; deployment requires manual CLI setup
- walletd not installed; not required for template development/test

## 21. Exact build commands
```
# Rust
cargo test --manifest-path crates/pool_math/Cargo.toml
cargo check --manifest-path crates/pool_math/Cargo.toml

# TypeScript
pnpm install
pnpm typecheck
pnpm --filter @tari-ootle/web build
pnpm --filter @tari-ootle/protocol-client build
pnpm --filter @tari-ootle/wallet-adapter build
```

## 22. Exact test commands
```
# Rust (all crate tests including adversarial)
cargo test --manifest-path crates/pool_math/Cargo.toml

# TypeScript (no automated test suite yet)
npm run build (verified static output)
```

## 23. Exact local run commands
```
# Web dev server
cd apps/web
pnpm dev  # opens localhost:3000

# Web production preview
pnpm --filter @tari-ootle/web build
pnpm --filter @tari-ootle/web preview
```

## 24. Next exact task
1. Install `tari-ootle-cli` (`cargo install tari-ootle-cli`)
2. Configure wallet daemon: `tari_ootle_walletd --network esmeralda -b /path/to/config`
3. Build template WASM: `cd templates/fungible_pool && cargo build --target wasm32-unknown-unknown --release` (requires upstream workspace or installed crates)
4. Publish to Esmeralda: `tari publish -a <account> --api-key <key> --network esmeralda`
4. Execute full liquidity lifecycle per `docs/ESMERALDA_VERTICAL_SLICE.md`
5. Verify all engine tests pass before marking P0 as TESTED

## 25. WASM Status
Source complete (`templates/fungible_pool/src/lib.rs`). Not yet built to binary. Requires upstream workspace dependencies or `tari build`.

## 26. Native Tari handling
Verified against upstream: uses `STEALTH_TARI_RESOURCE_ADDRESS` (ObjectKey of 1u8 repeated). Privacy boundary documented: wallet reveals Tari before pool entry; pool reserves are public.

## 27. First-deposit defense
`MINIMUM_INITIAL_LIQUIDITY = 1_000_000` (1 TARI in micro-tari) enforced on first deposit when both reserves are zero. Fixes documented first-depositor ratio manipulation attack.

## 28. LP Authority model
Documented in `docs/LP_AUTHORITY_MODEL.md`: only component methods mint/burn LP; access rules restrict mint to component, burn to resource owner; no creator privileges.

## 29. Engine tests
Documented in `templates/fungible_pool/tests/vertical_slice.rs` and `security_regressions.rs`. Require upstream `tari_template_test_tooling` workspace to execute.