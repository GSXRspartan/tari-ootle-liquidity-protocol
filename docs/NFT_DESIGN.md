# NFT DESIGN

Status: DESIGN_ONLY / BLOCKED for production trading

## Why separate from fungible AMM
NFTs are non-fungible. Constant-product AMM (`x * y = k`) requires fungible reserves. Feeding NFTs into fungible math is incorrect and dangerous.

## Current upstream APIs
- `NonFungibleId`, `NonFungibleAddress`, `NFT` bucket APIs exist in Tari Ootle.
- Resource types include `NonFungible`.
- No production NFT liquidity pool template exists in upstream TariSwap.

## Proposed design (future)
Type: NFT Inventory / Collection Pool

Mechanics:
- Pool holds a collection resource (public fungible or non-fungible collection identifier).
- Individual NFT IDs are tracked via `NonFungibleId` within the pool component or external inventory.
- Pricing uses discrete bonding curve or inventory-based floor (not `x*y=k`).
- Buyer selects specific NFT ID when possible; pool does not hide identity.
- Seller explicitly chooses NFT from inventory for sale.

Requirements (not yet implemented):
- Component can track NFT inventory safely.
- Malicious metadata URLs sanitized (no arbitrary code execution from image/metadata).
- Pool has deterministic pricing formula (transparent to buyer).
- No platform custody: seller chooses NFT, buyer receives exact NFT.
- No economic equivalence claim across NFTs in a collection.

## Blockers
- No tested upstream NFT pool template.
- Current TariSwap does not support NFT pairs.
- Storage and indexing of NFT metadata requires additional design.

## Feature gate
UI must disable NFT trading until:
- Template exists and passes adversarial tests.
- Metadata sanitization implemented.
- Inventory tracking verified.
- Route status moves from BLOCKED to EXPERIMENTAL or TESTED.
