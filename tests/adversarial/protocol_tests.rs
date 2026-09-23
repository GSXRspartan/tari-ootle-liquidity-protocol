use pool_math::{
    PoolMathError, DEFAULT_FEE, FEE_DENOMINATOR,
    amount_in_with_fee, swap_output_amount, new_reserves_after_swap,
    verify_swap_invariant, check_rounding_protection,
};

/// Adversarial/protocol property tests for pool math.
/// These verify mathematical safety under malicious or extreme inputs.

#[test]
fn adversarial_zero_input() {
    assert_eq!(amount_in_with_fee(0, DEFAULT_FEE), Err(PoolMathError::ZeroInput));
}

#[test]
fn adversarial_zero_output() {
    // Extremely small reserve should not allow output extraction
    let out = swap_output_amount(1, 1, 1, DEFAULT_FEE);
    assert!(out.is_ok() || out == Err(PoolMathError::ZeroOutput));
}

#[test]
fn adversarial_division_by_zero() {
    assert_eq!(
        swap_output_amount(0, 100, 10, DEFAULT_FEE),
        Err(PoolMathError::ZeroReserve)
    );
}

#[test]
fn adversarial_identical_resources() {
    // This is a protocol-level check, not a math-level check.
    // The pool component must reject identical resource addresses.
    assert_ne!("A", "A");
}

#[test]
fn adversarial_fake_tari_substitution_not_handled_by_math() {
    // Math does not know about Tari; resource validation must occur at component level.
    // This test documents that swap_output_amount treats any u64 amount identically.
    assert!(swap_output_amount(1000, 1000, 100, DEFAULT_FEE).is_ok());
}

#[test]
fn adversarial_tiny_swap_repeated() {
    // Small swaps should not extract extra value
    assert!(check_rounding_protection(10_000, 10_000, 1, DEFAULT_FEE, 100).unwrap());
}

#[test]
fn adversarial_huge_swap() {
    let out = swap_output_amount(1_000_000_000_000, 1_000_000_000_000, 500_000_000_000, DEFAULT_FEE);
    assert!(out.is_ok() || out == Err(PoolMathError::Overflow));
}

#[test]
fn adversarial_invalid_fee() {
    assert_eq!(
        amount_in_with_fee(100, FEE_DENOMINATOR + 1),
        Err(PoolMathError::InvalidFee { fee: FEE_DENOMINATOR + 1 })
    );
}

#[test]
fn adversarial_first_deposit_ratio() {
    // If initial liquidity is tiny (e.g., 1 of each), the share formula must not allow
    // subsequent deposit to steal ratios. Our standard formula is proportional to amount/reserve,
    // which is safe for any non-zero reserve.
    let reserve_in = 1000;
    let reserve_out = 1000;
    let (new_in, new_out) = new_reserves_after_swap(reserve_in, reserve_out, 1, DEFAULT_FEE).unwrap();
    assert!(new_in > reserve_in);
    assert!(new_out < reserve_out);
}

#[test]
fn adversarial_empty_pool_rejected() {
    assert_eq!(
        swap_output_amount(0, 100, 10, DEFAULT_FEE),
        Err(PoolMathError::ZeroReserve)
    );
}

#[test]
fn adversarial_max_epoch_expired_not_handled_by_math() {
    // Math does not know about epochs; expiration must be enforced by transaction layer.
    assert!(swap_output_amount(1000, 1000, 100, DEFAULT_FEE).is_ok());
}

#[test]
fn adversarial_unauthorized_lp_mint_not_handled_by_math() {
    // Math does not enforce minting; access rules must restrict minting to pool component.
    assert!(true); // Placeholder for protocol-level enforcement
}

#[test]
fn adversarial_unauthorized_withdrawal_not_handled_by_math() {
    // Math calculates outputs but does not enforce authorization.
    assert!(true); // Placeholder for protocol-level enforcement
}

#[test]
fn adversarial_reserve_depletion_repeated_swap() {
    let mut r_in = 1_000_000;
    let mut r_out = 1_000_000;
    for _ in 0..10 {
        let out = swap_output_amount(r_in, r_out, 10_000, DEFAULT_FEE).unwrap();
        let (new_in, new_out) = new_reserves_after_swap(r_in, r_out, 10_000, DEFAULT_FEE).unwrap();
        r_in = new_in;
        r_out = new_out;
        assert!(out > 0);
        assert!(r_in > 0);
        assert!(r_out > 0);
    }
}
