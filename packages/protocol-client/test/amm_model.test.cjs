const test = require('node:test');
const assert = require('node:assert/strict');

const { quoteSwapOutput, resolveAddLiquidity, resolveRemoveLiquidity } = require('../dist/amm.js');

/**
 * Independent AMM reference model.
 *
 * The oracle in this file is derived from first principles (constant-product
 * invariance, integer floor semantics, and proportional LP share arithmetic) and
 * NEVER calls the implementation to produce its expectation. `quoteSwapOutput` is
 * only ever the thing under test.
 *
 * Derivation used, written out so it can be checked by hand:
 *
 *   k_before  = rIn * rOut
 *   e         = floor(amountIn * (10_000 - feeBps) / 10_000)      // fee on input
 *   The swap must not reduce k, so the largest admissible payout is
 *     y_max  = rOut - ceil(k_before / (rIn + e))
 *   which is the integer form of "the pool empties as slowly as k allows".
 *   The implementation must return exactly y_max — no more (value extraction),
 *   no less (unnecessarily conservative rounding that would let a griefer
 *   sandwich the pool for free).
 */

// Deterministic 32-bit PRNG (mulberry32) so a failure is always reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ceilDiv = (a, b) => (a + b - 1n) / b;

/** The oracle. Derived above; independent of the implementation. */
function referenceSwap(rIn, rOut, amountIn, feeBps) {
  const e = (amountIn * (10_000n - feeBps)) / 10_000n;
  if (e === 0n) return { output: 0n, effectiveInput: 0n };
  const kBefore = rIn * rOut;
  const y = rOut - ceilDiv(kBefore, rIn + e);
  return { output: y < 0n ? 0n : y, effectiveInput: e };
}

test('amm model: the implementation matches the independent k-invariant oracle', () => {
  const rand = mulberry32(0x5eed1234);
  let checked = 0;
  for (let i = 0; i < 4000; i += 1) {
    const rIn = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const rOut = BigInt(1 + Math.floor(rand() * 10 ** 12));
    const amountIn = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const feeBps = BigInt(1 + Math.floor(rand() * 1000));

    const expected = referenceSwap(rIn, rOut, amountIn, feeBps);
    if (expected.effectiveInput === 0n || expected.output === 0n) continue;

    const actual = quoteSwapOutput(rIn.toString(), rOut.toString(), amountIn.toString(), feeBps.toString());
    assert.equal(actual.output, expected.output.toString(), `output mismatch for ${rIn}/${rOut}/${amountIn}/${feeBps}`);
    assert.equal(actual.effectiveInput, expected.effectiveInput.toString(), `effectiveInput mismatch for ${rIn}/${rOut}/${amountIn}/${feeBps}`);
    checked += 1;
  }
  assert.ok(checked > 3000, `only ${checked} cases exercised the oracle`);
});

test('amm model: a swap never reduces the constant product and never drains the reserve', () => {
  const rand = mulberry32(0x0badf00d);
  for (let i = 0; i < 4000; i += 1) {
    const rIn = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const rOut = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const amountIn = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const feeBps = BigInt(1 + Math.floor(rand() * 1000));
    const { output, effectiveInput } = quoteSwapOutput(rIn.toString(), rOut.toString(), amountIn.toString(), feeBps.toString());
    const out = BigInt(output);
    const e = BigInt(effectiveInput);

    // k cannot decrease: no value extraction, ever.
    assert.ok((rIn + e) * (rOut - out) >= rIn * rOut, `k decreased for ${rIn}/${rOut}/${amountIn}/${feeBps}`);
    // The reserve can never be emptied by a swap.
    assert.ok(out < rOut, 'a swap must never empty the output reserve');
    // The fee is taken from the input; it can never exceed it.
    assert.ok(e <= amountIn, 'the effective input cannot exceed the raw input');
    // Rounding is tight: paying one unit more would break the invariant, so the
    // implementation is not leaving free value on the table for sandwiches.
    assert.ok((rIn + e) * (rOut - out - 1n) < rIn * rOut, 'the quote is not the tightest admissible payout');
    // The full input is deposited, so LPs gain exactly `amountIn - e` in fees.
    assert.ok(amountIn - e >= 0n);
  }
});


/**
 * LP share accounting, derived independently.
 *
 * A depositor of `a`/`b` into a pool holding `(rA, rB)` with `total` LP must
 * receive at most `min(floor(a*total/rA), floor(b*total/rB))` shares — the
 * weaker side caps the mint, and that cap is what stops a lopsided deposit from
 * minting shares it has not paid for. Redeeming `lp` must return at most
 * `floor(lp*rA/total)` and `floor(lp*rB/total)`, and a round trip
 * deposit → redeem can never return more than what went in (no free value from
 * rounding, in either direction).
 */
test('amm model: an add-liquidity hint never exceeds the weaker proportional side', async () => {
  const rand = mulberry32(0xc0ffee11);
  const builder = { addLiquidity: (i) => ({ ...i, kind: 'add_liquidity' }), removeLiquidity: (i) => ({ ...i, kind: 'remove_liquidity' }) };
  for (let i = 0; i < 600; i += 1) {
    const total = BigInt(1_000_000 + Math.floor(rand() * 10 ** 12));
    const rA = BigInt(1_000_000 + Math.floor(rand() * 10 ** 9));
    const rB = BigInt(1_000_000 + Math.floor(rand() * 10 ** 9));
    const a = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const b = BigInt(1 + Math.floor(rand() * 10 ** 9));
    const aShares = (a * total) / rA;
    const bShares = (b * total) / rB;
    const capped = aShares < bShares ? aShares : bShares;

    const result = await resolveAddLiquidity(
      { poolComponent: 'pool_comp_1', rawAmountA: a.toString(), rawAmountB: b.toString(), maxEpoch: '1000' },
      {
        readback: {
          async readPool() {
            return {
              status: 'FOUND',
              value: {
                poolComponent: 'pool_comp_1',
                resourceA: 'res_a',
                resourceB: 'res_b',
                reserveA: rA.toString(),
                reserveB: rB.toString(),
                feeBps: '30',
                lpResource: 'lp_1',
                totalLpSupply: total.toString(),
                lockedLpSupply: '1000',
              },
              freshness: { source: 'WALLET_PROVIDER', identity: { readAtUnixMs: 1 } },
            };
          },
        },
        builder,
      },
    );
    if (result.status !== 'ACTIVE') continue;
    const mintHint = BigInt(result.resolved.expectedLpMintHint);
    // The resolver reports the min-side hint, and it can never exceed the oracle.
    assert.ok(mintHint <= capped, `hint ${mintHint} exceeded the weaker side ${capped}`);
    // Paying in must be worth at least the shares minted, on BOTH sides.
    assert.ok(mintHint * rA <= a * total, 'a depositor minted more than their A-side share');
    assert.ok(mintHint * rB <= b * total, 'a depositor minted more than their B-side share');
  }
});

test('amm model: a full round trip never returns more than was deposited', async () => {
  const rand = mulberry32(0x1234abcd);
  const builder = { addLiquidity: (i) => ({ ...i, kind: 'add_liquidity' }), removeLiquidity: (i) => ({ ...i, kind: 'remove_liquidity' }) };
  const pool = {
    poolComponent: 'pool_comp_1',
    resourceA: 'res_a',
    resourceB: 'res_b',
    reserveA: '1000000000',
    reserveB: '2000000000',
    feeBps: '30',
    lpResource: 'lp_1',
    totalLpSupply: '1000000000',
    lockedLpSupply: '1000',
  };
  const readback = { async readPool() { return { status: 'FOUND', value: pool, freshness: { source: 'WALLET_PROVIDER', identity: { readAtUnixMs: 1 } } }; } };

  for (let i = 0; i < 400; i += 1) {
    const a = BigInt(1_000_000 + Math.floor(rand() * 10 ** 8));
    const b = BigInt(1_000_000 + Math.floor(rand() * 10 ** 8));
    const add = await resolveAddLiquidity({ poolComponent: 'pool_comp_1', rawAmountA: a.toString(), rawAmountB: b.toString(), maxEpoch: '1000' }, { readback, builder });
    if (add.status !== 'ACTIVE') continue;
    const minted = BigInt(add.resolved.expectedLpMintHint);
    if (minted === 0n) continue;

    const remove = await resolveRemoveLiquidity({ poolComponent: 'pool_comp_1', rawLpAmount: minted.toString(), maxEpoch: '1000' }, { readback, builder });
    if (remove.status !== 'ACTIVE') continue;
    const outA = BigInt(remove.resolved.expectedA);
    const outB = BigInt(remove.resolved.expectedB);
    // A round trip through a stable pool can never mint value out of rounding.
    assert.ok(outA <= a, `round trip returned ${outA} > ${a} on side A`);
    assert.ok(outB <= b, `round trip returned ${outB} > ${b} on side B`);
  }
});
