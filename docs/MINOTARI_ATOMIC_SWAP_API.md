# Minotari atomic-swap API — exact-source trace

Status: **PARTIALLY TRACED — L1 source unavailable in this environment.** This document
records everything verifiable from local source, states precisely what is NOT yet verified,
and forbids invention. Updated: audit phase `b2ce0c8`, branch
`feat/multi-asset-stablecoin-markets`.

## Environments

| Repo | Local path | Revision | Role |
|---|---|---|---|
| tari-ootle (L2) | `C:\tmp-tari` | `2d6083e6cc7c98cde93dacebe2fb76b17703f588` (development HEAD, workspace 0.41.1) | L2 engine + walletd — FULLY TRACED |
| tari L1 (Minotari) | **NOT AVAILABLE LOCALLY** (offline machine; no clone present: checked `C:\tmp-tari`, `C:\tari-old-clean`, user dirs) | — | L1 HTLC primitive — **TRACE PENDING** |

The Tari L1 `minotari_console_wallet` commands `init-sha-atomic-swap`,
`finalise-sha-atomic-swap`, and `claim-sha-atomic-swap-refund` are advertised by upstream
Tari documentation. Their console implementation and wallet-service/gRPC signatures live in
the `tari-project/tari` repository (base_layer/wallet), which is NOT present in any local
checkout and could not be fetched during this phase (no network). **No L1 parameter, RPC
method name, or signature in this repository is inferred from those command names.**

## VERIFIED L2: Ootle stealth ScriptPath HTLC (interop-grade)

| Fact | Evidence (exact path, repo `2d6083e`) |
|---|---|
| Domain-separation-free hash digest designed for external-chain interop | `crates/engine_types/src/stealth/hashlock.rs` — module doc: "The preimage is hashed with no domain separation so a hashlock can interoperate with an external chain's HTLC"; `hashlock_digest(HashAlg::Sha256, preimage)` |
| SHA-256 byte-for-byte agreement with external chains | same file, test: SHA-256("abc") NIST vector must agree byte-for-byte |
| HTLC-shaped condition tree is a first-class engine structure | `crates/engine_types/src/stealth/condition_structure.rs` — two-leaf trees: claim leaf `[[{"Builtin":{"HashLock":{"hash":"<32B hex>","alg":"Sha256"}}}]]`, refund leaf `[[{"Builtin":{"AfterEpoch":<epoch>}}]]`; bounded by `TooManyConditions` |
| Witness construction is WASM-exposed (browser-compatible) | `crates/ootle_wasm/core/src/stealth/inputs.rs` — `build_script_path_witness(conditions_json, claim_leaf_json, preimage)`; tests at lines 195–232 cover two-leaf HTLC trees (claim + refund) and reject witnesses without `condition_root` |
| Spend path proven in-engine | `crates/ootle_wasm/wasm/src/lib.rs`, `crates/ootle_wasm/core/src/stealth/{inputs,types,transfer}.rs`; engine test `crates/engine/tests/spend_script.rs` |
| This repository does NOT yet consume it cross-chain | the only prior "atomic swap" artifact is a research template (C:\tari-old-clean\atomic-swap-template) using **domain-separated Blake2b** — explicitly NOT the interop path and NOT used by this phase |

The L2 leg therefore uses native stealth `PayTo::Conditions` outputs with
`HashLock(Sha256) + AfterEpoch` condition trees and `build_script_path_witness` witnesses.
No new swap template is introduced.

## VERIFIED (structural) L1 access surface

| Fact | Evidence |
|---|---|
| Ootle ships a Minotari base-node gRPC client | `clients/base_node_client` (traits.rs / grpc.rs) in the Ootle workspace |
| Ootle walletd has NO atomic-swap handler | `applications/tari_walletd/src/handlers/` — accounts.rs implements burn-proof claim (the Ootle↔L1 bridge), not SHA HTLCs |
| Minotari L1 wallet source absent locally | no `base_layer/`, no `minotari_console_wallet` in any local checkout |

## PENDING TRACE (blocks L1 adapter wiring, not the protocol architecture)

To be traced against `tari-project/tari` when network/source is available:

- [ ] `init-sha-atomic-swap` — exact method path, parameters (amount, hash form, refund height
      units), emitted transaction/output structure
- [ ] `finalise-sha-atomic-swap` — preimage submission semantics and tx construction
- [ ] `claim-sha-atomic-swap-refund` — refund-height validation semantics (absolute block height?)
- [ ] gRPC surface (wallet + base-node): tx lookup, output/spend status, confirmation count
- [ ] hash/preimage byte representation on L1 vs the Ootle `Hash32` (endianness/encoding)
- [ ] restart/recovery of in-flight swap outputs in the L1 wallet output manager

Until each box is checked, the L1 adapter implementation is gated behind
`MinotariWalletProvider` and MUST NOT be wired to invented RPC signatures.

## RFC-0310 relation (guidance only)

Tari RFC-0310 (submarine swaps) is treated as design/timeout/adversarial-model guidance.
This repository does NOT claim RFC-0310 conformance: the L1 leg will use the REAL shipped
SHA atomic-swap primitives once traced; any divergence (hash encoding, refund-height
semantics, party roles) will be documented here at trace time.