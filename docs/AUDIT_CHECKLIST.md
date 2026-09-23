# AUDIT CHECKLIST

Status before any mainnet: NOT AUDITED. This checklist documents what must be verified.

## Smart contract / WASM template audit
- [ ] Pool component has strict `AccessRules`: only component methods can modify vaults; no `adminWithdraw`; no `setFee` after creation.
- [ ] Fee tier is immutable after `new()`.
- [ ] Resource validation rejects non-fungible resources for fungible pools.
- [ ] Native Tari resource address is validated explicitly.
- [ ] LP resource minting is restricted to pool component.
- [ ] LP resource burning requires valid `ResourceAddress` match.

## Math verification
- [ ] Constant-product invariant verified for all valid inputs.
- [ ] Fee calculation rounds down (never favors trader over LP).
- [ ] No floating-point arithmetic used in AMM math.
- [ ] Overflow/underflow protected through checked arithmetic.
- [ ] Zero reserve, zero input, zero output all rejected.
- [ ] First-deposit vulnerability documented; minimum liquidity lock considered.
- [ ] Rounding protection verified through repeated swap property tests.

## Security review
- [ ] Threat model covers malicious frontend, compromised dependency, indexer corruption, replay, substitution, and reserve manipulation.
- [ ] Wallet adapter interface requires independent transaction preview before signing.
- [ ] Browser extension does not expose seed to web page.
- [ ] Mobile secure storage uses device-local encryption.
- [ ] No admin withdrawal mechanism exists.
- [ ] No upgrade mechanism over deployed pools.

## Protocol tests
- [ ] Adversarial tests for overflow, division by zero, tiny/huge swaps, empty pool, identical resources, fake Tari resource, unauthorized mint/withdraw.
- [ ] Integration tests for full swap -> add liquidity -> remove liquidity cycle.
- [ ] Feature gates correctly disable BLOCKED routes.

## Build and deployment
- [ ] Static build produces only HTML/JS/CSS (no server required).
- [ ] No secrets in build artifacts.
- [ ] Dependency lock files committed.
- [ ] CSP header configured.
- [ ] GitHub Pages workflow verified.

## Legal/compliance
- [ ] Disclaimer present in UI.
- [ ] No investment guarantee claims.
- [ ] No developer trading fee.
- [ ] Specialized legal review completed for jurisdiction of operation.
