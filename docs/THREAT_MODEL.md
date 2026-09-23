# THREAT MODEL

## Attackers
- Malicious website operator / compromised frontend
- Compromised GitHub / npm dependency / extension build pipeline
- Malicious dApp / XSS / clickjacking
- Frontrunner (transaction ordering observer)
- Sandwich attacker (front-run + back-run swap)
- Malicious resource creator (fake resource mimicking Tari or token)
- Rounding extractor (repeated small swaps to extract value)
- First depositor / donation attacker (manipulate LP ratios)
- Unauthorized pool withdrawal (if admin key exists)
- Replay attacker (re-sign same transaction with different nonce)
- Indexer disagreement / data corruption

## Defenses
1. Independent adapter preview: adapter displays full transaction manifest before signing; malicious frontend cannot substitute without adapter showing different values.
2. Immutable fee tier: set at pool creation; no admin `setFee`.
3. No admin withdrawal: pool components use access rules that allow only component methods; no `adminWithdraw` method exists in design.
4. Resource validation: `check_resource_is_fungible` and explicit resource addresses prevent fake Tari substitution.
5. Integer math: no floating-point; checked arithmetic prevents overflow/underflow.
6. Rounding direction: fee rounds down (protects LP); output calculation uses floor division; repeated swap tests verify no extraction.
7. Dependency pinning: `package-lock.json` / `Cargo.lock` committed; Dependabot/Renovate config optional.
8. CSP / no inline scripts / SRI where practical: reduces XSS impact.
9. Extension permissions: explicit site permissions, auto-lock, disconnect/revoke.

## Residual risks
- First depositor vulnerability: documented; recommend minimum liquidity lock or large initial deposit by trusted party.
- Stealth/confidential assets: AMM interaction reveals amounts at the pool boundary; privacy claims must explicitly state this.
- Wallet adapter security depends on host (browser extension crypto libraries, mobile OS secure storage) — document as external dependency.
- TariSwap upstream uses `AccessRules::allow_all()`; our production templates must implement strict rules before deployment.
- No formal audit completed: document exact audit status clearly.
