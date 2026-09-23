# FIRST-DEPOSITOR ATTACK ANALYSIS

## Current Implementation (VULNERABLE)

```rust
let a_ratio = if a_pool.is_zero() {
    Amount::from(1_000_000u32)
} else {
    a_amount / a_pool
};
let b_ratio = if b_pool.is_zero() {
    Amount::from(1_000_000u32)
} else {
    b_amount / b_pool
};

let share_factor = Amount::from(1_000_000u32);
let new_lp_amount = (a_ratio * share_factor) + (b_ratio * share_factor);
```

## Attack Walkthrough

1. **Attacker creates pool** with minimum deposits: `1_000_000` of A and `1_000_000` of B
2. **Both pools zero** → `a_ratio = 1_000_000`, `b_ratio = 1_000_000`
3. `share_factor = 1_000_000`
4. `new_lp_amount = (1_000_000 * 1_000_000) + (1_000_000 * 1_000_000) = 2_000_000_000_000` (2 trillion shares)
5. **Attacker receives ALL 2 trillion LP shares** (100% of pool)
6. **Attacker can donate** huge amounts to reserves directly (if engine permits)
7. **Victim deposits** e.g., 1_000_000_000 of each token
8. **Victim share calculation**: `a_ratio = 1_000_000_000 / (reserve_after_attack)` → tiny
9. Victim receives negligible shares → attacker controls nearly 100% of pool

**THE MINIMUM DEPOSIT CHECK DOES NOT PREVENT THIS** — it only enforces a floor on the first deposit amount, but the share formula still gives 100% to first depositor.

## Required Fix: Geometric Mean + Locked Minimum

### Correct Formula (Uniswap V2 Standard)
```
initial_shares = floor(sqrt(amount_a * amount_b))
mint_to_first_lp = initial_shares - MINIMUM_LOCKED_LIQUIDITY
permanently_lock = MINIMUM_LOCKED_LIQUIDITY
```

### Why This Works
- `initial_shares` is proportional to geometric mean of deposits
- `MINIMUM_LOCKED_LIQUIDITY` is permanently burned/locked → cannot be withdrawn
- First LP gets fair proportional shares, not 100%
- Locked portion ensures pool always has "minimum liquidity" backing

### Example with Fix
Attacker deposits 1,000,000 each:
- `initial_shares = floor(sqrt(1_000_000 * 1_000_000)) = 1_000_000`
- If `MINIMUM_LOCKED = 1000`: attacker gets 999,000 shares, 1000 locked
- Victim deposits 1,000,000,000 each → gets proportional shares fairly

## Implementation Requirements

1. **Integer sqrt**: floor(sqrt(x)) for u128 (Amount internal)
2. **Checked arithmetic**: no overflow on amount_a * amount_b (use u128)
3. **MINIMUM_LOCKED_LIQUIDITY**: derive from LP token properties
   - LP token is standard fungible (divisibility typically 8 or 18)
   - Use small constant like 1000 (in LP token smallest units)
   - Must be permanently non-redeemable
4. **Locked mechanism**: burn the MINIMUM_LOCKED immediately after minting total initial_shares
   - `mint_fungible(initial_shares)` then `burn(MINIMUM_LOCKED)` from component's own vault
   - Or mint to a special "locked" address if Ootle supports it
   - Simpler: mint `initial_shares`, immediately `burn(MINIMUM_LOCKED)` from component's LP vault

## Ootle-Safe Locking Mechanism

```rust
let initial_shares = integer_sqrt(a_amount * b_amount);
let to_mint = initial_shares - MINIMUM_LOCKED;
let lp_bucket = ResourceManager::get(lp_resource).mint_fungible(initial_shares);
// Immediately burn MINIMUM_LOCKED from the minted bucket
lp_bucket.take(MINIMUM_LOCKED).burn(); // If Bucket supports take()
// Return remaining to first LP
return lp_bucket;
```

This ensures:
- Total supply = initial_shares - MINIMUM_LOCKED (for fair accounting)
- MINIMUM_LOCKED is permanently removed from circulation
- No special addresses or owner badges needed
- Uses only standard Bucket/ResourceManager APIs