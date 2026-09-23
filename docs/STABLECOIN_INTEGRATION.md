# STABLECOIN INTEGRATION

Status: P3 BLOCKED / DESIGN ONLY

## Upstream source
- Repository: https://github.com/tari-project/stable-coin
- Branch: main
- License: BSD-3-Clause
- Template: `templates/private_stable_coin/issuer-no-user-badge/` is the working version.

## Current upstream capabilities (from source inspection)
- Stealth token issuance with configurable supply.
- Admin controls (pause, freeze/unfreeze UTXOs, token recall, user blacklisting).
- Wrapped token exchange: stealth <-> public fungible.
- Configurable fees (fixed or percentage-based).

## Why direct private stablecoin AMM is blocked
- Admin-controlled templates have privileged functions (`pause`, `freeze`, `recall`, `setAdmin`) that violate our protocol's non-custody, permissionless requirement.
- Our protocol must NOT include admin keys, pause functions, or user blacklisting.
- Direct private AMM trading would reveal amounts or require admin-managed conversion, which conflicts with permissionless design.

## Likely safe route (to verify)
```
PRIVATE STABLECOIN
        ->
PUBLIC WRAPPED STABLECOIN (via upstream exchange mechanism, without admin control)
        ->
AMM (public fungible pair)
        ->
OPTIONAL PRIVATE CONVERSION (user-controlled, separate from protocol)
```

## Privacy disclosure matrix
| Step | Asset Type | Amount Visibility | Admin Control Required |
|------|-----------|-------------------|------------------------|
| User wallet (before deposit) | Private stealth | Hidden | No |
| AMM pool deposit | Revealed public amount | Revealed | No (if using public wrapped) |
| AMM reserve | Revealed public amount | Revealed | No |
| AMM output (public wrapped) | Revealed public amount | Revealed | No |
| Conversion back to private | User-controlled | Hidden after conversion | Depends on upstream mechanism |

Important: The AMM trade itself is NEVER confidential if amounts and resource links are revealed at the pool boundary. Any claim of "confidential trading" through this protocol must be false.

## Blocker evidence
- `stable-coin` templates include admin badge requirements (`issuer` with user badges; `admin-only control`).
- `AccessRules` in stable-coin templates include privileged operations not suitable for permissionless AMM.
- No upstream public, permissionless stablecoin AMM exists today.

## Next task (after P0-P1)
1. Build public wrapped stablecoin adapter using non-admin upstream mechanism or create independent public fungible wrapper.
2. Verify that conversion mechanism does not require our protocol to hold admin keys.
3. Test with current stable-coin source before enabling any route.
