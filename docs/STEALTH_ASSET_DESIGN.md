# STEALTH ASSET DESIGN

Status: DESIGN_ONLY for AMM integration (P2 blocked)

## What the component knows
The pool component only knows resource addresses, amounts in vaults, and bucket operations. It has no access to private payment data, stealth addresses, or confidential amounts unless explicitly constructed with those features.

## What a stealth vault exposes
- `Vault` balances are visible to anyone inspecting the component substate.
- If an asset enters the pool via a standard `Bucket` deposit, the amount is revealed at the pool boundary.
- Private wallet balances remain hidden until revealed through a deposit/transfer to the public component.

## Privacy boundary (explicit disclosure)
```
PRIVATE / STEALTH WALLET BALANCE
        ->
REVEALED AMOUNT AT AMM BOUNDARY (when depositing into public pool)
        ->
PUBLIC / REVEALED POOL ACCOUNTING
```

The AMM does NOT maintain private reserve accounting. All pool reserves and LP shares are public by design (required for constant-product verification by any observer).

## Adapter model for stealth/confidential routes
- User can create pools for stealth/confidential resources.
- Before deposit, user must decide whether to reveal amounts to the public AMM.
- If truly private reserve accounting is needed, a separate confidential vault template (not this AMM) would be required.
- Our protocol uses a public AMM adapter for stealth assets, with explicit privacy disclosure.

## Current SDK behavior
- `@chironbuilder/ootle-sdk` supports `sendPrivately`, `shield`/`unshield`, confidential withdraw proof.
- `execute()` handles automatic input resolution with retry.
- Storage abstraction (`KeyValueStore`) is separate from our protocol design.

## Blockers for production stealth route
- No upstream TariSwap template handles stealth/confidential pairs securely.
- AMM math assumes public reserve visibility for invariant verification.
- If stealth assets are used in AMM, the revealed amounts at boundary must be clearly communicated to user.

## Feature gate
P2 routes (Stealth Asset / Tari) must remain BLOCKED or EXPERIMENTAL until:
- Template handles stealth deposit/reveal correctly.
- User interface clearly states privacy loss at AMM boundary.
- Adversarial tests pass for stealth pair swaps.
