# ARCHITECTURE

## Design principles
- Non-custodial: user controls keys, no server custody
- Static web: buildable to static files, deployable to GitHub Pages
- Separation of concerns: wallet adapter, protocol client, UI
- Immutable pools: no admin withdrawal, no upgrade authority
- Permissionless factory: anyone can create pool for any fungible pair

## Component diagram

STATIC WEB UI (React/Vite)
  |
  v
WALLET ADAPTER (Browser Extension / Mobile / walletd / Embedded)
  |
  v
SIGNED TRANSACTION
  |
  v
TARI OOTLE LAYER-2 (template components / native Tari)
  |
  v
INDEXER / PUBLIC READ APIs

## Key seams
1. WalletAdapter interface separates signing from web page.
2. ProtocolClient abstracts indexer/network; never authorizes fund movement.
3. PoolFactory creates immutable pool components; no admin access rules.
4. AMM math lives in `crates/pool_math` (pure integer arithmetic, independently testable).

## Repository layout
- crates/pool_math: integer AMM math
- crates/protocol_types: resource addresses, fee tiers, pool identifiers
- packages/protocol-client: indexer/network interaction
- packages/wallet-adapter: adapter interfaces
- packages/ootle-wallet-core: SDK wrapper
- packages/ui-components: shared React components
- apps/web: static frontend
- apps/extension: browser extension signer
- apps/mobile: Capacitor mobile app scaffold
- docs/: design, security, upstream reference
- templates/: Ootle WASM templates (future)

## Security boundary
The static website must never receive a seed phrase or raw private key. Signing must occur in the adapter (extension, mobile secure storage, or advanced walletd). All transaction previews must be independently verifiable by the adapter before signing.
