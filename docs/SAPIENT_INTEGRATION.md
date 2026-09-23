# SAPIENT INTEGRATION

Status: ADAPTER INTERFACE ONLY; MISSING STABLE PUBLIC API

## Source references
- SDK docs reference: https://github.com/chironbuilds/tari-wallet (PolyForm Noncommercial license)
- SDK notes: "The two wallets this was extracted from are licensed separately, under PolyForm Noncommercial"
- This repository does NOT copy any Sapient source code.

## What the SDK says
- Sapient wallet uses a Chrome extension architecture.
- SDK (`@chironbuilder/ootle-sdk`) was extracted from Sapient and Tari L1 web wallet to avoid duplicated fixes.
- SDK is MIT; Sapient wallet is PolyForm Noncommercial.
- SDK does NOT include dApp permission model, address books, or transaction history — those are app-level concerns.

## Stable dApp connection API
As of 2026-09-22, there is NO documented stable public dApp connection API exposed by Sapient that is independent of the wallet's internal UI. The SDK documentation mentions:
- `chromeStorageAdapter` for storage.
- `OotleAccount` for account derivation.
- No `connect` or `approveTransaction` interface is documented as a standard browser extension message protocol.

## Adapter interface (implemented here)
We create `SapientWalletAdapter` implementing our `WalletAdapter` interface.

Capabilities:
- `connect()`: attempt to detect Sapient extension presence; if unavailable, return explicit unsupported error.
- `disconnect()`: revoke permission through adapter mechanism if available.
- `getNetwork()`, `getAccounts()`, etc.: delegate to SDK where possible; otherwise return `UNSUPPORTED`.

## Missing upstream functionality (exact blocker)
1. Stable public dApp message protocol for transaction approval/rejection.
2. Documented permission model (site-level grant/revoke) independent of wallet source.
3. Standard `signAndSubmit` interface that works without wallet daemon dependency.
4. Official adapter documentation that permits third-party dApps to connect without copying wallet code.

## Implementation approach
- Implement adapter with capability detection (`isSupported(): boolean`).
- If Sapient extension is detected and exposes a standard message port, implement message passing for transaction preview and approval.
- If no stable API exists, return clear errors (`SapientConnectionNotSupported`) rather than fabricating a connection.
- Never attempt to inject into Sapient's internal UI or extract seed through unsupported APIs.

## License boundary
- This adapter ONLY interacts with Sapient through public message interfaces or SDK APIs.
- No Sapient source code is copied into this repository.
- Any future integration must comply with PolyForm Noncommercial terms (no commercial redistribution of copied code).
