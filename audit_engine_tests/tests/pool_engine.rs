// Real Ootle engine tests for the fungible_pool template (SECURITY_AUDIT_OPUS).
//
// These execute the ACTUAL template WASM in the engine via tari_template_test_tooling
// (the template at ../templates/fungible_pool is compiled to WASM and loaded). They encode
// the economic and authorization invariants the audit fixes rely on, so any regression in
// the template is caught by real engine execution rather than by inspection.

use tari_ootle_common_types::substate_type::SubstateType;
use tari_ootle_transaction::args;
use tari_template_lib::types::{Amount, ComponentAddress, NonFungibleAddress, ResourceAddress};
use tari_template_test_tooling::TemplateTest;

const CRATE_PATH: &str = env!("CARGO_MANIFEST_DIR");

struct PoolTest {
    t: TemplateTest,
    a: ResourceAddress,
    b: ResourceAddress,
    lp: ResourceAddress,
    pool: ComponentAddress,
    account: ComponentAddress,
    account_proof: NonFungibleAddress,
}

fn create_faucet(t: &mut TemplateTest, symbol: &str) -> (ComponentAddress, ResourceAddress) {
    let initial = Amount::from(1_000_000_000_000u64);
    let component: ComponentAddress = t.call_function(
        "TestFaucet",
        "mint_with_symbol",
        args![initial, symbol.to_string()],
        vec![],
    );
    let resource = t
        .get_previous_output_address(SubstateType::Resource)
        .as_resource_address()
        .unwrap();
    (component, resource)
}

fn setup(fee: u16) -> PoolTest {
    let mut t = TemplateTest::new(
        CRATE_PATH,
        ["../templates/fungible_pool", "templates/faucet"],
    );

    let (a_faucet, a) = create_faucet(&mut t, "AAA");
    let (b_faucet, b) = create_faucet(&mut t, "BBB");

    let pool_template = t.get_template_address("Pool");
    let seal_tx = t
        .transaction()
        .call_function(pool_template, "new", args![a, b, fee])
        .build_and_seal(t.secret_key());
    let res = t.execute_expect_success(seal_tx, vec![]);
    let (pool_addr, _) = res
        .expect_success()
        .up_iter()
        .find(|(addr, s)| {
            addr.is_component()
                && *s.substate_value().component().unwrap().template_address() == pool_template
        })
        .unwrap();
    let pool = pool_addr.as_component_address().unwrap();
    let (lp_addr, _) = res
        .expect_success()
        .up_iter()
        .find(|(addr, _)| addr.is_resource())
        .unwrap();
    let lp = lp_addr.as_resource_address().unwrap();

    // IMPORTANT: the account is a SEPARATE identity from the pool creator (t.secret_key()).
    // If LP minting were gated on the creator's owner badge, this account could not add
    // liquidity; proving that it CAN is the evidence that the pool is permissionless.
    let (account, account_proof, _) = t.create_funded_account();
    let mut pt = PoolTest {
        t,
        a,
        b,
        lp,
        pool,
        account,
        account_proof,
    };
    fund(&mut pt, a_faucet);
    fund(&mut pt, b_faucet);
    pt
}

fn fund(pt: &mut PoolTest, faucet: ComponentAddress) {
    let account = pt.account;
    let tx =
        pt.t.transaction()
            .call_method(faucet, "take_free_coins", args![])
            .put_last_instruction_output_on_workspace("coins")
            .call_method(account, "deposit", args![Workspace("coins")]);
    pt.t.build_and_execute(tx, vec![]).expect_success();
}

// NOTE: `resource` comes BEFORE `&mut pt` so a `pt.<field>` argument is read (Copy) before the
// mutable borrow is taken — avoids E0503 at call sites (two-phase borrow does not apply to a free
// function's explicit `&mut` argument).
fn account_balance(resource: ResourceAddress, pt: &mut PoolTest) -> Amount {
    let acc = pt.account;
    pt.t.call_method(acc, "balance", args![resource], vec![])
}

fn pool_balance(resource: ResourceAddress, pt: &mut PoolTest) -> Amount {
    let pool = pt.pool;
    pt.t.call_method(pool, "get_pool_balance", args![resource], vec![])
}

fn add_liquidity(pt: &mut PoolTest, a_amt: Amount, b_amt: Amount) {
    let (a, b, account, pool, proof) = (pt.a, pt.b, pt.account, pt.pool, pt.account_proof.clone());
    let tx =
        pt.t.transaction()
            .call_method(account, "withdraw", args![a, a_amt])
            .put_last_instruction_output_on_workspace("a")
            .call_method(account, "withdraw", args![b, b_amt])
            .put_last_instruction_output_on_workspace("b")
            .call_method(pool, "add_liquidity", args![Workspace("a"), Workspace("b")])
            .put_last_instruction_output_on_workspace("lp")
            .call_method(account, "deposit", args![Workspace("lp")]);
    pt.t.build_and_execute(tx, vec![proof]).expect_success();
}

// ---------------------------------------------------------------------------

/// Mint authority + permissionlessness: a NON-creator account can add the first liquidity and
/// receive LP. Pre-fix, LP mint was `DenyAll` with only a resource-owner override, so a
/// non-creator identity could not mint. The component-scoped mint rule makes it permissionless.
#[test]
fn e01_permissionless_add_liquidity_and_lp_received() {
    let mut pt = setup(3);
    add_liquidity(
        &mut pt,
        Amount::from(10_000_000u64),
        Amount::from(10_000_000u64),
    );
    let lp_held = account_balance(pt.lp, &mut pt);
    println!("e01 LP held by non-creator provider = {}", lp_held);
    assert!(lp_held.is_positive(), "non-creator provider received no LP");
    // total minted = floor(sqrt(1e7*1e7)) = 1e7; locked minimum = 1000
    assert_eq!(
        lp_held,
        Amount::from(10_000_000u64) - Amount::from(1_000u64)
    );
}

/// Redemption / trapped-funds: full redemption returns essentially all deposited reserves.
/// Pre-fix `ratio = lp/total` truncated to 0 and returned NOTHING, trapping funds.
#[test]
fn e02_redemption_returns_reserves() {
    let mut pt = setup(3);
    add_liquidity(
        &mut pt,
        Amount::from(10_000_000u64),
        Amount::from(10_000_000u64),
    );

    let lp_held = account_balance(pt.lp, &mut pt);
    let a_before = account_balance(pt.a, &mut pt);
    let b_before = account_balance(pt.b, &mut pt);

    let (lp, account, pool, proof) = (pt.lp, pt.account, pt.pool, pt.account_proof.clone());
    let tx =
        pt.t.transaction()
            .call_method(account, "withdraw", args![lp, lp_held])
            .put_last_instruction_output_on_workspace("lp")
            .call_method(pool, "remove_liquidity", args![Workspace("lp")])
            .put_last_instruction_output_on_workspace("out")
            .call_method(account, "deposit", args![Workspace("out.0")])
            .call_method(account, "deposit", args![Workspace("out.1")]);
    pt.t.build_and_execute(tx, vec![proof]).expect_success();

    let a_ret = account_balance(pt.a, &mut pt) - a_before;
    let b_ret = account_balance(pt.b, &mut pt) - b_before;
    println!("e02 returned a={} b={}", a_ret, b_ret);
    // Provider held 9_999_000 of 10_000_000 total supply; expect ~9_999_000 of each.
    assert!(
        a_ret >= Amount::from(9_990_000u64),
        "A returned too small (trapped funds?): {}",
        a_ret
    );
    assert!(
        b_ret >= Amount::from(9_990_000u64),
        "B returned too small (trapped funds?): {}",
        b_ret
    );
}

/// Fee / invariant: after a swap the constant product k must strictly INCREASE (fee retained
/// for LPs). Pre-fix the swap used the full input in the k-division and discarded the fee.
#[test]
fn e03_swap_charges_fee_growing_k() {
    let mut pt = setup(30); // 3.0% fee
    add_liquidity(
        &mut pt,
        Amount::from(1_000_000_000u64),
        Amount::from(1_000_000_000u64),
    );

    let a0 = pool_balance(pt.a, &mut pt).to_u128();
    let b0 = pool_balance(pt.b, &mut pt).to_u128();
    let k0 = a0 * b0;

    let (a, b, account, pool, proof) = (pt.a, pt.b, pt.account, pt.pool, pt.account_proof.clone());
    let tx =
        pt.t.transaction()
            .call_method(account, "withdraw", args![a, Amount::from(100_000_000u64)])
            .put_last_instruction_output_on_workspace("in")
            .call_method(pool, "swap", args![Workspace("in"), b, Amount::from(1u64)])
            .put_last_instruction_output_on_workspace("out")
            .call_method(account, "deposit", args![Workspace("out")]);
    pt.t.build_and_execute(tx, vec![proof]).expect_success();

    let a1 = pool_balance(pt.a, &mut pt).to_u128();
    let b1 = pool_balance(pt.b, &mut pt).to_u128();
    let k1 = a1 * b1;
    println!("e03 k0={} k1={}", k0, k1);
    assert!(
        k1 > k0,
        "fee NOT charged: k did not grow (k0={} k1={})",
        k0,
        k1
    );
}

/// Slippage: a swap whose min_output exceeds the achievable output must abort atomically.
#[test]
fn e04_slippage_min_output_enforced() {
    let mut pt = setup(3);
    add_liquidity(
        &mut pt,
        Amount::from(1_000_000_000u64),
        Amount::from(1_000_000_000u64),
    );

    let (a, b, account, pool, proof) = (pt.a, pt.b, pt.account, pt.pool, pt.account_proof.clone());
    let sealed =
        pt.t.transaction()
            .call_method(account, "withdraw", args![a, Amount::from(1_000_000u64)])
            .put_last_instruction_output_on_workspace("in")
            // demand an impossibly high output
            .call_method(
                pool,
                "swap",
                args![Workspace("in"), b, Amount::from(1_000_000_000u64)],
            )
            .put_last_instruction_output_on_workspace("out")
            .call_method(account, "deposit", args![Workspace("out")])
            .build_and_seal(pt.t.secret_key());
    let reason = pt.t.execute_expect_failure(sealed, vec![proof]);
    println!("e04 rejected as expected: {:?}", reason);
}
