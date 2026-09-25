/**
 * Minotari wallet provider boundary (L1 leg).
 *
 * The protocol consumes ONLY this typed interface. A browser-capable provider does not yet
 * exist (see docs/MINOTARI_ATOMIC_SWAP_API.md): the three SHA atomic-swap primitives are
 * advertised by Tari documentation but their wallet/gRPC implementation is not traceable
 * in the current offline environment, so the concrete wiring is BLOCKED_EXTERNAL. A
 * development provider over an injected transport is provided for testnet harness work
 * once the real API is pinned — the interface here is protocol-needs-driven, NOT an
 * invented RPC mapping.
 *
 * Layers are separate: CONSTRUCT / SIGN-AUTHORIZE / SUBMIT / OBSERVE / CLAIM / REFUND /
 * RECONCILE. No opaque swap().
 */
import { HashHex, SecretHex } from './types.js';

export const BROWSER_MINOTARI_PROVIDER: 'READY' | 'BLOCKED_EXTERNAL' = 'BLOCKED_EXTERNAL';
export const BROWSER_PROVIDER_BLOCKER =
  'No browser-safe Minotari wallet provider exists yet; the L1 SHA atomic-swap gRPC surface must be pinned against tari-project/tari source first (trace pending in docs/MINOTARI_ATOMIC_SWAP_API.md).';

/** Whether the backing implementation is wired to VERIFIED L1 primitives. */
export type L1PrimitiveStatus = 'PENDING_TRACE' | 'VERIFIED';

export interface MinotariWalletInfo {
  walletAddress: string;
  network: string;
  readiness: 'READY' | 'SYNCING' | 'UNAVAILABLE';
}

export interface MinotariChainStatus {
  network: string;
  currentHeight: string;
  /** Authoritative chain tip info from the base node / wallet sync. */
  synced: boolean;
}

export interface MinotariBalanceInfo {
  available: string;
  pendingIncoming: string;
  pendingOutgoing: string;
}

/** CONSTRUCT: an L1 HTLC funding intent (never signed or submitted here). */
export interface L1HtlcFundingIntent {
  amountRaw: string;
  /** SHA256(S) — 32-byte hex, byte-for-byte compatible with the Ootle Hash32. */
  hash: HashHex;
  claimRecipient: string;
  refundRecipient: string;
  /** Absolute L1 block height after which the taker can refund. */
  refundHeight: string;
  network: string;
  operationId: string;
}

/** OBSERVE: authoritative view of an L1 HTLC output. */
export interface L1HtlcObservation {
  l1TxId: string;
  exists: boolean;
  amountRaw: string;
  hashHex?: HashHex;
  claimRecipient?: string;
  refundHeight?: string;
  confirmations: string;
  currentHeight: string;
  /** Whether the output has been spent (claimed or refunded). */
  spent: boolean;
  spentByTxId?: string;
  /** Authoritative source marker (base node / wallet output manager). */
  source: 'BASE_NODE' | 'WALLET_OUTPUT_MANAGER' | 'PROVIDER_ASSERTION';
}

export interface MinotariWalletProvider {
  /** Unique backend id (e.g. 'local-grpc-dev'). */
  providerName(): string;
  /** True only when the implementation is wired to VERIFIED L1 primitives. */
  primitivesStatus(): L1PrimitiveStatus;
  network(): string;
  discoverWallets(): Promise<MinotariWalletInfo[]>;
  readiness(): Promise<MinotariWalletInfo['readiness']>;
  chainStatus(): Promise<MinotariChainStatus>;
  balance(walletAddress: string): Promise<MinotariBalanceInfo>;
  /** Layer 1 — CONSTRUCT the funding intent (no signature, no submission). */
  constructHtlcFunding(intent: L1HtlcFundingIntent): { intent: L1HtlcFundingIntent; feeEstimate: string };
  /** Layer 2 — SIGN/AUTHORIZE (may prompt a user). */
  authorizeFunding(signedIntent: { intent: L1HtlcFundingIntent; feeEstimate: string }): Promise<{ authorized: true }>;
  /** Layer 3 — SUBMIT. MUST reject (not throw-and-forget) on transport loss so the
   * coordinator persists UNKNOWN via its own handling. Returns the durable tx id on ack. */
  submitFunding(intent: L1HtlcFundingIntent): Promise<{ l1TxId: string }>;
  /** OBSERVE: authoritative readback of the HTLC output. */
  observeHtlc(l1TxId: string): Promise<L1HtlcObservation>;
  /** CLAIM (counterparty side): finalise with the revealed preimage. */
  constructClaim(l1TxId: string, preimage: SecretHex, claimRecipient: string, operationId: string): Promise<{ feeEstimate: string }>;
  authorizeClaim(l1TxId: string, preimage: SecretHex): Promise<{ authorized: true }>;
  submitClaim(l1TxId: string, preimage: SecretHex): Promise<{ l1TxId: string }>;
  /** REFUND after the refund height, per the real refund primitive. */
  constructRefund(l1TxId: string, refundRecipient: string, operationId: string): Promise<{ feeEstimate: string }>;
  authorizeRefund(l1TxId: string): Promise<{ authorized: true }>;
  submitRefund(l1TxId: string): Promise<{ l1TxId: string }>;
  /** RECONCILE: authoritative tx lookup for UNKNOWN outcomes. */
  lookupTransaction(l1TxId: string): Promise<'COMMITTED' | 'REJECTED' | 'NOT_FOUND' | 'UNKNOWN'>;
  /** Restart/recovery: enumerate in-flight swap outputs after a crash. */
  listInFlightSwaps(walletAddress: string): Promise<Array<{ operationId: string; l1TxId?: string }>>;
}

/**
 * L2 (Ootle) leg port. The REAL primitives are the verified stealth ScriptPath
 * `PayTo::Conditions` outputs (HashLock Sha256 + AfterEpoch) and the WASM
 * `build_script_path_witness` witness builder; the adapter maps this port onto the
 * wallet-adapter builders + authoritative Ootle readback already implemented.
 */
export interface OotleScriptPathLegPort {
  /** CONSTRUCT the L2 stealth HTLC funding (withdraw stealth TARI → PayTo::Conditions). */
  constructFunding(intent: { hashH: HashHex; tariRawAmount: string; claimRecipient: string; refundEpoch: string; network: string; operationId: string }): Promise<{ feeEstimate: string }>;
  authorizeFunding(operationId: string): Promise<{ authorized: true }>;
  submitFunding(operationId: string): Promise<{ l2TxId: string }>;
  /** OBSERVE: authoritative L2 readback of the hashlock output. */
  observeHashlockOutput(l2TxId: string): Promise<{ exists: boolean; amountRaw: string; hashExact: boolean; claimantExact: boolean; epochRefundExact: boolean; unspent: boolean; source: 'AUTHORITATIVE' | 'CACHED' }>;
  constructClaim(l2TxId: string, preimage: string, operationId: string): Promise<{ feeEstimate: string }>;
  submitClaim(l2TxId: string, preimage: string): Promise<{ l2TxId: string }>;
  constructRefund(l2TxId: string, operationId: string): Promise<{ feeEstimate: string }>;
  submitRefund(l2TxId: string): Promise<{ l2TxId: string }>;
  lookupTransaction(l2TxId: string): Promise<'COMMITTED' | 'REJECTED' | 'NOT_FOUND' | 'UNKNOWN'>;
}