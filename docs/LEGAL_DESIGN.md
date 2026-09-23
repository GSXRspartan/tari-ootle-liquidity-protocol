# LEGAL DESIGN

## Goals (compliance-first architecture)
- Non-custodial protocol: user directs all transactions.
- Self-directed users: no investment advice, no guaranteed return.
- Spot trading only: no leverage, margin, borrowing, lending, futures, perpetuals, options.
- No developer-managed price, no central matching engine, no operator custody.

## What this is NOT
- Not a centralized exchange.
- Not a custody service (keys never stored by operator).
- Not an investment product.
- Not a guaranteed legal safe harbor (specialized U.S. legal review required before mainnet).
- Not a security trading venue.

## Restrictions enforced in design
- No protocol fee (0% developer fee).
- No admin withdrawal from pools.
- No upgrade mechanism over deployed pools.
- No governance token.
- No mandatory donation required for trading/liquidity.
- Optional donation only: explicit, separate from AMM transaction, zero allowed, direct to configured address.

## User responsibility
Asset creators and users are responsible for applicable law. The protocol does not enforce securities classification; users must comply with local regulations.

## Disclaimer template (recommended in UI)
"This protocol is non-custodial and permissionless at the blockchain layer. Users are solely responsible for ensuring their use complies with all applicable laws. This is not an offer to sell securities, and no investment return is guaranteed. The developers receive no trading fee and have no ability to access pool funds."

## Audit recommendation
Before any mainnet deployment:
- Formal smart contract audit by specialized firm.
- U.S. securities law review (or equivalent jurisdiction) for the specific token pairs offered.
- Privacy impact assessment for stealth/confidential routes.
