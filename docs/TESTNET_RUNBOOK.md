# TESTNET RUNBOOK

Target network: Esmeralda (current Tari Ootle testnet)
Upstream reference: tari-ootle development branch

## Prerequisites
- Rust toolchain with wasm32-unknown-unknown target
- Node.js >= 20, pnpm
- tari-cli installed (`cargo install tari-ootle-cli`)
- Wallet daemon running for advanced/development testing (`tari_ootle_walletd --network esmeralda`)

## Build templates
```
# Build the pool math crate
cargo build --manifest-path crates/pool_math/Cargo.toml --target wasm32-unknown-unknown --release

# Build web frontend
pnpm install
pnpm --filter @tari-ootle/web build
```

## Test commands
```
# Rust tests
cargo test --manifest-path crates/pool_math/Cargo.toml

# TypeScript typecheck
pnpm install
pnpm typecheck

# Build verification
ls apps/web/dist/
```

## Run web locally
```
cd apps/web
pnpm dev
# Open http://localhost:3000
```

## Inspect upstream TariSwap test
```
# Clone upstream (optional)
git clone --depth 1 https://github.com/tari-project/tari-ootle.git /tmp/tari-ootle
cat /tmp/tari-ootle/crates/engine/tests/templates/tariswap/src/lib.rs
```

## Check indexer endpoint health
```
curl -X POST https://indexer.esmeralda.tari.com -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"get_version","id":1}'
```

## Feature gate verification
- Confirm BLOCKED routes (Stealth, Stablecoin, NFT) are disabled in UI.
- Confirm Experimental routes (Public Fungible / Tari) display warnings but allow preview.
- Confirm wallet adapter returns unsupported for Sapient mode.
