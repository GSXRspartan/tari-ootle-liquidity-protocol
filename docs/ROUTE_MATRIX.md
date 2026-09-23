# ROUTE SUPPORT MATRIX

Source of truth: `crates/protocol_types/src/lib.rs` (`initial_route_matrix()`)
UI must read from this source; never hardcode route status independently.

| Route Pair | Asset Types | Status | Fee Tier | Blocker / Note |
|------------|-------------|--------|----------|----------------|
| Public Fungible / Tari Native | Fungible / Fungible (Tari resource) | Experimental | 30 bp (0.30%) | Requires native Tari resource validation; TariSwap template supports this |
| Public Fungible / Public Fungible | Fungible / Fungible | Experimental | 30 bp (0.30%) | Standard AMM; tested with integer math; requires deployment |
| Stealth Asset / Tari Native | Stealth / Fungible | Blocked | 30 bp (0.30%) | Privacy loss at AMM boundary; requires user disclosure |
| Stealth Asset / Public Fungible | Stealth / Fungible | Blocked | 30 bp (0.30%) | Same privacy issue |
| Wrapped Stablecoin / Tari Native | Public Fungible (wrapped) / Fungible | Blocked | 30 bp (0.30%) | Requires upstream stablecoin without admin controls |
| Private Stablecoin Direct / Public | Confidential / Fungible | Blocked | 30 bp (0.30%) | Direct private AMM not safe; use wrapped route first |
| NFT Collection / Tari Native | Non-Fungible / Fungible | Blocked | N/A | Requires separate NFT inventory design; no upstream pool exists |

Status definitions:
- TESTED: Executed on testnet with verified results.
- EXPERIMENTAL: Functionally designed and partially verified; may require further testing.
- DESIGN_ONLY: Architecture documented; no executable path.
- BLOCKED: Missing upstream feature, unsafe today, or conflicts with security model.
- DISABLED: Not applicable or deprecated.

## Changing status
- A BLOCKED route must NOT become clickable just because a UI component exists.
- Status updates require:
  1. Implementation of template/code.
  2. Adversarial tests passing.
  3. Upstream blocker resolved (if applicable).
  4. Documentation updated (this file and protocol_types source).
  5. Feature gate removed explicitly.
