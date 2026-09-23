# NATIVE TARI SEMANTICS IN AMM

Source reference: upstream tari-ootle (`C:\tmp-tari`), commit `2d6083e6cc7c98cde93dacebe2fb76b17703f588`
Workspace version: `0.41.1`

## Exact upstream constant
File: `crates/template_lib_types/src/constants.rs` (line 63)
```
pub const STEALTH_TARI_RESOURCE_ADDRESS: ResourceAddress =
    ResourceAddress::new(ObjectKey::from_array([1u8; ObjectKey::LENGTH]));
```
Alias: `TARI_TOKEN`. Deprecated alias: `XTR`.
Divisibility: 6 (from `constants.rs` comment: "divisibility of 6, meaning smallest unit is 0.000001 TARI").
Unit definition: `pub const TARI: u64 = 1_000_000;` (1 TARI = 1,000,000 micro-tari).

## Resource type
Native Tari is a `ResourceType::Stealth` (per `resource_type.rs` and TariSwap validation). The TariSwap template accepts `Stealth` through:
```
assert!(
    matches!(
        resource_type,
        ResourceType::Fungible | ResourceType::Confidential | ResourceType::Stealth
    ),
    "Resource {} is not fungible",
    resource
);
```
Our `fungible_pool/src/lib.rs` uses the same `matches!()` pattern.

## Privacy boundary (critical)
Native Tari wallet balances are stealth (hidden) before interaction with the pool. The wallet must construct a valid stealth/revealed withdrawal statement (`StealthTransferStatement` / `StealthWithdrawProof`) before depositing Tari into the pool component. The component itself does NOT handle stealth cryptography; it only sees revealed `Bucket` amounts.

Therefore:
- Tari wallet balance: PRIVATE (stealth UTXOs)
- Pool component reserve: PUBLIC (revealed amount in vault)
- AMM price/reserve data: PUBLIC (any observer can read vault balances)
- Withdrawal output: PUBLIC amount returned to wallet; wallet may optionally shield it again through separate wallet mechanisms

This is the correct architectural boundary. The AMM component should NEVER claim to maintain confidential reserves. Any claim that the AMM itself is "confidential" is false.

Documented in `docs/STEALTH_ASSET_DESIGN.md`.
