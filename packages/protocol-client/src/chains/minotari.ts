/**
 * Minotari L1 adapter seam — INTERFACES ONLY. Nothing here is implemented yet; these types
 * prove the generic execution architecture (readback / construct / sign / submit /
 * confirm / history / reconciliation) is chain-agnostic enough to host a second chain.
 *
 * No fake implementations. No RPC methods are invented here — the concrete transport is a
 * later, separately-audited phase (REAL MINOTARI L1 / FAST XTM↔TARI ATOMIC LIQUIDITY).
 */
import { TransactionLookup } from '../execution.js';

/** Minotari native unit — raw pico-tari style integer string; never a JS number. */
export type MinotariRawAmount = string;

export interface MinotariWalletDiscovery {
  walletAddress: string;
  label?: string;
}

export interface MinotariBalance {
  available: MinotariRawAmount;
  pendingIncoming: MinotariRawAmount;
  pendingOutgoing: MinotariRawAmount;
}

export interface MinotariInitShaSwap {
  swapId: string;
  /** Our side's SHA-256 hash of the preimage. */
  hash: string;
  amount: MinotariRawAmount;
  counterpartyAddress: string;
  timeoutHeight: string;
}

export type MinotariSwapObservation =
  | { state: 'AWAITING_FUNDING'; fundingTxHash?: string }
  | { state: 'FUNDED'; fundingTxHash: string; blockHeight: string }
  | { state: 'CLAIMED'; claimTxHash: string }
  | { state: 'REFUNDED'; refundTxHash: string }
  | { state: 'TIMED_OUT' };

export type MinotariFinalityStatus = 'OBSERVED' | 'BLOCK_CONFIRMED' | 'FINALIZED' | 'REORGED';

/** The future adapter contract. Implementation phase: REAL MINOTARI L1 atomic liquidity. */
export interface MinotariAdapter {
  adapterName(): 'minotari';
  /** Wallet discovery / connection. */
  discoverWallets(): Promise<MinotariWalletDiscovery[]>;
  connect(address?: string): Promise<MinotariWalletDiscovery>;
  balance(walletAddress: string): Promise<MinotariBalance>;
  /** Init SHA-256 atomic swap (HTLC-style) on L1. */
  initShaAtomicSwap(request: MinotariInitShaSwap): Promise<{ txHash: string }>;
  /** Observe counterparty funding of the swap output. */
  observeFunding(swapId: string): Promise<MinotariSwapObservation>;
  /** Confirm/finality policy (height confirmations, reorg window). */
  confirmFinality(txHash: string, policy: { requiredConfirmations: string }): Promise<MinotariFinalityStatus>;
  /** Finalise/claim with the revealed preimage. */
  claim(swapId: string, preimageSha256: string): Promise<{ txHash: string }>;
  /** Refund after timeout without the counterparty claiming. */
  refund(swapId: string): Promise<{ txHash: string }>;
  /** Transaction lookup for reconciliation by durable id. */
  lookup: TransactionLookup;
  /** Restart recovery: enumerate in-flight swaps after a client crash. */
  listInFlightSwaps(walletAddress: string): Promise<Array<{ swapId: string; observation: MinotariSwapObservation }>>;
}