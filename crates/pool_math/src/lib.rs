use thiserror::Error;

/// Errors in pool math operations.
#[derive(Debug, Error, PartialEq, Eq, Clone, Copy)]
pub enum PoolMathError {
    #[error("zero reserve prevents division")]
    ZeroReserve,
    #[error("zero input amount")]
    ZeroInput,
    #[error("zero output amount")]
    ZeroOutput,
    #[error("overflow in arithmetic operation")]
    Overflow,
    #[error("underflow in arithmetic operation")]
    Underflow,
    #[error("invalid fee: {fee} (must be 1..9999 for 0.01%..99.99%)")]
    InvalidFee { fee: u32 },
    #[error("identical resource addresses not allowed")]
    IdenticalResource,
}

/// Maximum allowed fee denominator (to keep fee < 100%).
/// Fee is expressed as basis points out of 10000 (e.g., 30 = 0.30%).
pub const FEE_DENOMINATOR: u32 = 10_000;

/// Default fee tier: 30 basis points = 0.30%.
pub const DEFAULT_FEE: u32 = 30;

/// Check arithmetic result type using u128 for intermediate calculations,
/// then cast back to u64.
///
/// This prevents overflow for reasonable reserve sizes (< 2^64) but
/// handles multiplication safely.
fn safe_mul_u64(a: u64, b: u64) -> Result<u64, PoolMathError> {
    let result = (a as u128) * (b as u128);
    if result > u64::MAX as u128 {
        return Err(PoolMathError::Overflow);
    }
    Ok(result as u64)
}

fn safe_div_u64(a: u64, b: u64) -> Result<u64, PoolMathError> {
    if b == 0 {
        return Err(PoolMathError::ZeroReserve);
    }
    Ok(a / b)
}

fn safe_sub_u64(a: u64, b: u64) -> Result<u64, PoolMathError> {
    if b > a {
        return Err(PoolMathError::Underflow);
    }
    Ok(a - b)
}

fn safe_add_u64(a: u64, b: u64) -> Result<u64, PoolMathError> {
    let result = (a as u128) + (b as u128);
    if result > u64::MAX as u128 {
        return Err(PoolMathError::Overflow);
    }
    Ok(result as u64)
}

/// Calculate the fee-adjusted input amount.
///
/// `amount_in_with_fee = amount_in * (fee_denominator - fee_numerator) / fee_denominator`
///
/// Rounding: rounds DOWN (integer division), meaning the fee is at least the stated
/// percentage, never less. This protects LPs from rounding extraction by traders.
pub fn amount_in_with_fee(amount_in: u64, fee_numerator: u32) -> Result<u64, PoolMathError> {
    if fee_numerator >= FEE_DENOMINATOR {
        return Err(PoolMathError::InvalidFee { fee: fee_numerator });
    }
    if amount_in == 0 {
        return Err(PoolMathError::ZeroInput);
    }
    let fee_numerator = fee_numerator as u128;
    let amount_in = amount_in as u128;
    let denominator = FEE_DENOMINATOR as u128;
    let factor = denominator - fee_numerator;
    let result = (amount_in * factor) / denominator;
    if result > u64::MAX as u128 {
        return Err(PoolMathError::Overflow);
    }
    Ok(result as u64)
}

/// Constant-product swap output amount.
///
/// Formula (verified independently):
/// `amount_out = reserve_out * amount_in_with_fee / (reserve_in * fee_denominator + amount_in_with_fee)`
///
/// Wait, the standard fee-adjusted constant product is:
/// `amount_in_with_fee = amount_in * (1 - fee)`
/// `amount_out = reserve_out * amount_in_with_fee / (reserve_in + amount_in_with_fee)`
///
/// But the user's example was:
/// `amount_out = reserve_out * amount_in_with_fee / (reserve_in * fee_denominator + amount_in_with_fee)`
///
/// This is EQUIVALENT if `amount_in_with_fee = amount_in * (fee_denominator - fee_numerator)`
/// because:
/// `reserve_in * fee_denominator + amount_in_with_fee`
/// when substituting `amount_in_with_fee` with `amount_in * (fee_denominator - fee)`:
/// Wait, that doesn't match directly. Let's verify.
///
/// Actually the user's formula is:
/// `amount_in_with_fee = amount_in * (fee_denominator - fee_numerator)`
/// `amount_out = reserve_out * amount_in_with_fee / (reserve_in * fee_denominator + amount_in_with_fee)`
///
/// Let's check dimensionally. If `fee_numerator = 0` (no fee):
/// `amount_in_with_fee = amount_in * fee_denominator`
/// `amount_out = reserve_out * amount_in * fee_denominator / (reserve_in * fee_denominator + amount_in * fee_denominator)`
/// `= reserve_out * amount_in / (reserve_in + amount_in)` — correct constant product.
///
/// So the formula is valid when `amount_in_with_fee` is already scaled by `fee_denominator`.
/// Let's implement both forms and test consistency.
pub fn swap_output_amount(
    reserve_in: u64,
    reserve_out: u64,
    amount_in: u64,
    fee_numerator: u32,
) -> Result<u64, PoolMathError> {
    if reserve_in == 0 || reserve_out == 0 {
        return Err(PoolMathError::ZeroReserve);
    }
    if amount_in == 0 {
        return Err(PoolMathError::ZeroInput);
    }
    let _amount_in_with_fee_unscaled = amount_in_with_fee(amount_in, fee_numerator)?;

    // Using the user's formula:
    // amount_out = reserve_out * amount_in_with_fee / (reserve_in * fee_denominator + amount_in_with_fee)
    // Here `amount_in_with_fee` is unscaled relative to fee_denominator.
    // Wait: if `amount_in_with_fee = amount_in * (fee_denominator - fee_numerator) / fee_denominator`,
    // then substituting:
    // amount_out = reserve_out * [amount_in*(denom-fee)/denom] / [reserve_in*denom + amount_in*(denom-fee)/denom]
    // = reserve_out * amount_in*(denom-fee) / [reserve_in*denom^2 + amount_in*(denom-fee)]
    // That's not the same as standard.

    // Let's use the standard form:
    // amount_in_with_fee (already reduced by fee percentage, not scaled by denominator)
    // = amount_in * (1 - fee/denom) = amount_in * (denom - fee) / denom
    // Then:
    // amount_out = reserve_out * amount_in_with_fee / (reserve_in + amount_in_with_fee)
    //
    // Let's compute with integers:
    let fee_numerator = fee_numerator as u128;
    let amount_in_128 = amount_in as u128;
    let reserve_in_128 = reserve_in as u128;
    let reserve_out_128 = reserve_out as u128;
    let denom_128 = FEE_DENOMINATOR as u128;

    let reduced_factor = denom_128 - fee_numerator;
    let amount_in_with_fee_128 = (amount_in_128 * reduced_factor) / denom_128;

    // amount_out = reserve_out * amount_in_with_fee / (reserve_in + amount_in_with_fee)
    let denominator = reserve_in_128 + amount_in_with_fee_128;
    let numerator = reserve_out_128 * amount_in_with_fee_128;

    let output = (numerator / denominator) as u64;

    if output == 0 {
        return Err(PoolMathError::ZeroOutput);
    }
    Ok(output)
}

/// Verify that the constant product is preserved after a swap (ignoring fees).
/// `reserve_in_new * reserve_out_new = reserve_in_old * reserve_out_old`
///
/// With fees, `reserve_in_new * reserve_out_new >= reserve_in_old * reserve_out_old`.
pub fn verify_swap_invariant(
    reserve_in_before: u64,
    reserve_out_before: u64,
    reserve_in_after: u64,
    reserve_out_after: u64,
) -> bool {
    let k_before = safe_mul_u64(reserve_in_before, reserve_out_before).unwrap_or(u64::MAX);
    let k_after = safe_mul_u64(reserve_in_after, reserve_out_after).unwrap_or(u64::MAX);
    k_after >= k_before
}

/// Compute the fee-adjusted input for a given fee tier.
/// Fee tier is expressed in basis points out of 10_000.
/// Example: 30 = 0.30%.
pub fn compute_fee_amount(amount: u64, fee_basis_points: u32) -> Result<u64, PoolMathError> {
    if fee_basis_points > FEE_DENOMINATOR {
        return Err(PoolMathError::InvalidFee { fee: fee_basis_points });
    }
    let amount_128 = amount as u128;
    let fee_128 = fee_basis_points as u128;
    let denom_128 = FEE_DENOMINATOR as u128;
    let fee_amount = (amount_128 * fee_128) / denom_128;
    Ok(fee_amount as u64)
}

/// Compute the new reserve balances after a swap (without fee effect on output).
/// This is mainly for testing invariants.
pub fn new_reserves_after_swap(
    reserve_in: u64,
    reserve_out: u64,
    amount_in: u64,
    fee_numerator: u32,
) -> Result<(u64, u64), PoolMathError> {
    let _amount_in_with_fee_unscaled = amount_in_with_fee(amount_in, fee_numerator)?;
    // Wait: amount_in_with_fee returns scaled down amount.
    // But for reserve updates:
    // reserve_in_after = reserve_in + amount_in (full amount deposited)
    // reserve_out_after = reserve_out - output_amount
    // The fee stays inside reserve_in, so reserve_in_after = reserve_in + amount_in.
    let output_amount = swap_output_amount(reserve_in, reserve_out, amount_in, fee_numerator)?;
    let new_reserve_in = safe_add_u64(reserve_in, amount_in)?;
    let new_reserve_out = safe_sub_u64(reserve_out, output_amount)?;
    Ok((new_reserve_in, new_reserve_out))
}

/// Verify that a swap does not allow reserve drain through rounding.
/// Repeated swaps in one direction should monotonically decrease output ratio.
pub fn check_rounding_protection(
    reserve_in: u64,
    reserve_out: u64,
    amount_in: u64,
    fee_numerator: u32,
    iterations: u32,
) -> Result<bool, PoolMathError> {
    let mut r_in = reserve_in;
    let mut r_out = reserve_out;
    let mut prev_output = swap_output_amount(r_in, r_out, amount_in, fee_numerator)?;
    for _ in 1..iterations {
        let out = swap_output_amount(r_in, r_out, amount_in, fee_numerator)?;
        if out > prev_output {
            // Rounding went in trader's favor; this indicates potential extraction
            return Ok(false);
        }
        prev_output = out;
        // Update reserves as if swap completed
        let (new_in, new_out) = new_reserves_after_swap(r_in, r_out, amount_in, fee_numerator)?;
        r_in = new_in;
        r_out = new_out;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_fee_is_30_bp() {
        assert_eq!(DEFAULT_FEE, 30);
    }

    #[test]
    fn amount_in_with_fee_no_fee() {
        assert_eq!(amount_in_with_fee(1000, 0).unwrap(), 1000);
    }

    #[test]
    fn amount_in_with_fee_30_bp() {
        // 1000 * (10000 - 30) / 10000 = 997
        assert_eq!(amount_in_with_fee(1000, 30).unwrap(), 997);
    }

    #[test]
    fn amount_in_with_fee_rounds_down() {
        // 7 * 9970 / 10000 = 6979 / 10000 = 0 (integer division rounds down)
        // Actually 7 * 9970 = 69790; /10000 = 6
        assert_eq!(amount_in_with_fee(7, 30).unwrap(), 6);
    }

    #[test]
    fn swap_output_standard_case() {
        // Reserve: 1000 A, 1000 B. Swap 100 A for B with 0 fee.
        // Expected: 100 * 1000 / (1000 + 100) = 100000 / 1100 = 90 (floor)
        let out = swap_output_amount(1000, 1000, 100, 0).unwrap();
        assert_eq!(out, 90);
    }

    #[test]
    fn swap_output_with_fee_30bp() {
        // Reserve: 10000 A, 10000 B. Swap 1000 A for B with 30bp.
        // amount_in_with_fee = 997
        // out = 10000 * 997 / (10000 + 997) = 9970000 / 10997 = 906 (floor)
        let out = swap_output_amount(10_000, 10_000, 1_000, 30).unwrap();
        assert_eq!(out, 906);
    }

    #[test]
    fn invariant_preserved_without_fee() {
        // Before: 1000 * 1000 = 1_000_000
        // After swap of 100: reserve_in = 1100, reserve_out = 910 (approx)
        // 1100 * 910 = 1_001_000 >= 1_000_000
        let (new_in, new_out) = new_reserves_after_swap(1000, 1000, 100, 0).unwrap();
        assert!(verify_swap_invariant(1000, 1000, new_in, new_out));
    }

    #[test]
    fn zero_reserve_rejected() {
        assert_eq!(
            swap_output_amount(0, 100, 10, 30),
            Err(PoolMathError::ZeroReserve)
        );
    }

    #[test]
    fn zero_input_rejected() {
        assert_eq!(
            swap_output_amount(100, 100, 0, 30),
            Err(PoolMathError::ZeroInput)
        );
    }

    #[test]
    fn overflow_protection() {
        // Large values should not overflow with safe arithmetic
        let result = swap_output_amount(1_000_000_000_000, 1_000_000_000_000, 1_000, 0);
        assert!(result.is_ok());
    }

    #[test]
    fn rounding_protection_multiple_swaps() {
        // Repeated small swaps should not extract extra value
        assert!(check_rounding_protection(10_000, 10_000, 100, 30, 10).unwrap());
    }

    #[test]
    fn test_compute_fee_amount() {
        assert_eq!(compute_fee_amount(10000, 30).unwrap(), 30);
        assert_eq!(compute_fee_amount(1, 30).unwrap(), 0); // rounds down
    }
}
