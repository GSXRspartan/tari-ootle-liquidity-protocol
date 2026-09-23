# UPSTREAM BASELINE

Inspected on: 2026-09-22

## tari-ootle (core L2 protocol)
- Repository: https://github.com/tari-project/tari-ootle
- Branch: development
- Latest inspected commit: 2+ commits on development branch (shallow clone)
- Date inspected: 2026-09-22
- License: BSD-3-Clause
- Why we use: Source of TariSwap template, engine tests, template ABI/lib definitions
- Risks/limitations: Heavy development; TariSwap is in engine test templates, not production-grade library; access rules are `.with_access_rules(AccessRules::allow_all())` in the test template

## ootle-sdk-ts / @chironbuilder/ootle-sdk
- Repository: https://github.com/chironbuilds/ootle-sdk-ts
- Package: @chironbuilder/ootle-sdk
- Version inspected: 0.1.11 (npm, published 6 days before inspection)
- Commit/reference: master branch, 16 commits total
- License: MIT
- Why we use: Shared TypeScript wallet SDK extracted from Sapient and Tari L1 web wallet; provides account derivation, balances, transaction building, storage abstraction
- Risks/limitations: Explicitly EARLY 0.x; README states "not yet wired back" into consuming wallets; vendors two patches (`@tari-project/ootle` serialization gap, `@tari-project/ootle-wasm` confidential withdraw proof); treat as experimental

## tari-cli
- Repository: https://github.com/tari-project/tari-cli
- Branch: main
- Latest commit: 120 commits on main
- License: BSD-3-Clause
- Why we use: Template development, WASM build, publish reference
- Risks/limitations: Template CLI is evolving; requires wallet daemon API key for publish

## stable-coin
- Repository: https://github.com/tari-project/stable-coin
- Branch: main
- Latest commit: 92 commits on main
- License: BSD 3-Clause
- Why we use: Confidential/stablecoin template reference; shows admin controls (pause, freeze, recall) we must avoid in public AMM
- Risks/limitations: Admin-controlled templates must NOT be used for permissionless liquidity; our protocol must be admin-free

## TariSwap Reference (inside tari-ootle)
- Paths:
  - crates/engine/tests/templates/tariswap/src/lib.rs
  - crates/engine/tests/templates/tariswap/Cargo.toml
  - crates/engine/tests/tariswap.rs
  - utilities/tariswap_test_bench/src/tariswap.rs
- License: BSD-3-Clause (same repo)
- Why we reference: Constant-product AMM with fee as per-mil (0..100 = 0%..10%), vault-based reserves, public fungible resource pair checks, LP token mint/burn via ResourceManager
- Risks/limitations:
  - Fee uses integer division by 1000: `amount - (amount * fee) / 1000` — this rounds DOWN in favor of the protocol/LP, not the trader (acceptable for fee collection but must be documented)
  - `check_resource_is_fungible` allows `ResourceType::Fungible | ResourceType::Confidential | ResourceType::Stealth` — but the AMM logic does not handle stealth/confidential math correctly without additional privacy leakage modeling
  - `AccessRules::allow_all()` is a placeholder; production pools need explicit rules
  - `new_lp_amount = a_ratio * a_amount + b_ratio * b_amount` uses ratios derived from pool balance; vulnerable to first-deposit ratio manipulation if initial liquidity is tiny
  - `remove_liquidity` uses `.div_ceil()` which can over-round; must verify no reserve drain over repeated operations
  - No minimum liquidity lock; first depositor can take full share and then manipulate ratios
  - `lp_total_supply()` reads from `ResourceManager::get(resource).total_supply()`; this is safe if mint/burn are restricted

## Sapient Wallet
- Source reference: https://github.com/chironbuilds/tari-wallet (referenced in SDK docs; not copied into this repo)
- License: PolyForm Noncommercial (per SDK docs: "The two wallets this was extracted from are licensed separately, under PolyForm Noncommercial")
- Action taken: NOT copied into this repo. Only adapter interface is implemented here; actual integration requires separate license review
