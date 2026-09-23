use pool_math::{PoolMathError, DEFAULT_FEE, swap_output_amount, new_reserves_after_swap, verify_swap_invariant};

/// Basic integration tests for the full AMM cycle.

#[test]
fn integration_full_cycle_small_reserves() {
    let reserve_in = 1_000;
    let reserve_out = 1_000;
    let amount_in = 100;

    let output = swap_output_amount(reserve_in, reserve_out, amount_in, DEFAULT_FEE).unwrap();
    let (new_in, new_out) = new_reserves_after_swap(reserve_in, reserve_out, amount_in, DEFAULT_FEE).unwrap();

    assert!(output > 0);
    assert!(new_in == reserve_in + amount_in);
    assert!(new_out == reserve_out - output);
    assert!(verify_swap_invariant(reserve_in, reserve_out, new_in, new_out));
}

#[test]
fn integration_large_reserves_maintain_invariant() {
    let reserve_in = 10_000_000_000;
    let reserve_out = 10_000_000_000;
    let amount_in = 100_000_000;

    let (new_in, new_out) = new_reserves_after_swap(reserve_in, reserve_out, amount_in, DEFAULT_FEE).unwrap();
    assert!(verify_swap_invariant(reserve_in, reserve_out, new_in, new_out));
}
