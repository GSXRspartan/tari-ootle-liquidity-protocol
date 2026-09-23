# SECURITY MODEL

## Assumptions
- User controls their wallet adapter (extension, mobile device, or walletd).
- Static website is untrusted after deployment (compromised build = malicious UI, but no automatic fund access).
- Indexer data is for reads only; it cannot authorize movement of funds.
- Pool contracts/components have no admin withdrawal keys.

## Threat categories addressed
- Malicious/swapped frontend: adapter must independently display transaction details (component, resources, amounts, fee) so user can detect substitution.
- Compromised GitHub account: pinned dependencies, build verification, CSP, and no secrets in JS prevent automatic fund theft.
- Compromised indexer: indexer only provides read data; signed transactions enforce on-chain rules.
- Malicious resources: resource addresses are validated against fungible types; fake Tari resources are rejected by address validation.
- LP share inflation: share minting uses deterministic math; only pool component can mint/burn (enforced by access rules).
- Reserve drain: integer arithmetic with no float rounding; fee rounds down (protects LP); repeated swap protection tested.
- First depositor attack: initial liquidity ratio manipulation is documented; users must verify ratios; future improvement: enforce minimum liquidity lock.

## Signing boundary
- Browser Extension Signer: own encrypted wallet, local derivation, independent approval, never exposes raw keys to page.
- Embedded Mobile Wallet: device-local encrypted seed; platform key storage abstraction.
- walletd Signer: advanced/development only; never required for normal web users.
- Direct In-Browser Wallet: EXPERIMENTAL ONLY; not preferred production architecture.

## Non-custody guarantees
- No backend server holds user deposits.
- No admin withdrawal function exists in pool templates.
- No protocol fee; 100% of swap fees accrue to LP reserves.
- No upgrade mechanism for deployed pools (new versions = new pools).

## Transaction enforcement
Every swap must enforce on-chain:
- exact input resource and amount (via bucket)
- minimum output (via max_epoch/deadline and explicit output amount check)
- component address (pool identity)
- resource address pair (no substitution)
- fee tier (immutable after creation)
- max_epoch/deadline
