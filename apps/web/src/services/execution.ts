/**
 * Execution service.
 *
 * The browser NEVER computes an execution result. This service is the only
 * place that drives the protocol-client pipeline:
 *
 *   DISCOVER (advisory)
 *     → resolveSwap / resolveAddLiquidity / resolveRemoveLiquidity
 *       (authoritative reread, exact quote, slippage, refusals)
 *     → executeResolved (persist PENDING → sign → submit → persist)
 *     → confirmSubmitted / reconcileOperation (poll by durable id)
 *
 * A React component receives the returned values and renders them. There is no
 * constant-product math, no reserve math, and no min_output derivation here.
 */

import {
  executeResolved,
  confirmSubmitted,
  reconcileOperation,
  requireFreshSubmissionAllowed,
  type FlowResult,
  type Freshness,
  type OperationRecord,
  type SigningTransport,
  type SwapIntentBuilder,
  type LiquidityIntentBuilder,
  type MarketplaceRouteBuilder,
  type TransactionLookup,
  type ChainTransactionStatus,
} from '@tari-ootle/protocol-client';
import type { TransactionPreview, TransactionResult } from '@tari-ootle/wallet-adapter';
import { toAmmPreview, toMarketplacePreview } from '@tari-ootle/wallet-adapter';
import { historyStore } from './history.js';
import { asRawExecutionAmount, asResourceAddress } from '../lib/tradeBoundary.js';

export interface ExecutionWallets {
  /** The generic wallet seam. */
  preview(preview: Partial<TransactionPreview>): Promise<TransactionPreview>;
  signAndSubmit(preview: TransactionPreview, context: SigningContext): Promise<TransactionResult>;
  getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }>;
}

export interface SigningContext {
  /** Human-readable assets, so the wallet prompt is never opaque. */
  assets: string[];
  operation: string;
  network: string;
  poolOrDestination: string;
  privacyDisclosure: string;
}

function statusFrom(raw: string): ChainTransactionStatus {
  const upper = raw.toUpperCase();
  if (upper === 'COMMITTED' || upper === 'CONFIRMED' || upper === 'SUCCESS') return 'COMMITTED';
  if (upper === 'REJECTED' || upper === 'FAILED' || upper === 'ABORTED') return 'REJECTED';
  if (upper === 'NOT_FOUND') return 'NOT_FOUND';
  return 'UNKNOWN';
}

export function createTransactionLookup(wallets: ExecutionWallets): TransactionLookup {
  return {
    async statusByTransactionId(transactionId: string): Promise<ChainTransactionStatus> {
      const result = await wallets.getTransactionStatus(transactionId);
      return statusFrom(result.status);
    },
    async committedEpoch(transactionId: string): Promise<string | undefined> {
      const result = await wallets.getTransactionStatus(transactionId);
      return result.epoch === undefined ? undefined : String(result.epoch);
    },
  };
}

let operationCounter = 0;

/** Durable, client-generated operation identity. Not random-looking to the chain. */
export function newOperationId(prefix: string): string {
  operationCounter += 1;
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${prefix}-${Date.now().toString(36)}-${operationCounter.toString(36)}-${random}`;
}

export interface ExecuteSwapInput<TIntent> {
  resolvedIntent: TIntent;
  recordInput: {
    operationId: string;
    operationKind: string;
    componentOrOrderId?: string;
    resources: string[];
    amounts: Record<string, string>;
    quote?: { quotedOutput: string; minOutput: string };
    epoch?: string;
    expiryEpoch?: string;
    lastReadback: Freshness;
  };
  toPreview: (intent: TIntent) => TransactionPreview;
  context: SigningContext;
}

/**
 * Construct → sign → submit → persist, via the protocol-client's own flow.
 *
 * Note the inputs are funnelled through `asRawExecutionAmount` /
 * `asResourceAddress`, which refuse branded market-data display values. That is
 * the runtime half of the market-data trust boundary; the type-level half lives
 * in `lib/tradeBoundary.ts`.
 */
export async function executeSwap<TIntent>(wallets: ExecutionWallets, input: ExecuteSwapInput<TIntent>): Promise<FlowResult> {
  input.recordInput.resources = input.recordInput.resources.map((resource, index) => asResourceAddress(resource, `resources[${index}]`));
  for (const [key, value] of Object.entries(input.recordInput.amounts)) asRawExecutionAmount(value, `amounts.${key}`);
  if (input.recordInput.quote !== undefined) {
    asRawExecutionAmount(input.recordInput.quote.quotedOutput, 'quote.quotedOutput');
    asRawExecutionAmount(input.recordInput.quote.minOutput, 'quote.minOutput');
  }

  const transport: SigningTransport<WalletEnvelope> = {
    construct: (resolvedIntent: unknown) => ({ preview: input.toPreview(resolvedIntent as TIntent) }),
    async sign(envelope: WalletEnvelope) {
      // Layer 2/3 are a single wallet call; the protocol-client's transport
      // contract is preserved by carrying the durable id back on the envelope.
      const result = await wallets.signAndSubmit(envelope.preview, input.context);
      return { ...envelope, transactionId: result.transactionId, epoch: result.epoch };
    },
    async submit(signed: WalletEnvelope) {
      if (signed.transactionId === undefined) {
        throw new Error('The wallet did not acknowledge a transaction id; the submission is recorded as UNKNOWN.');
      }
      return { transactionId: signed.transactionId };
    },
    lookup: createTransactionLookup(wallets),
  };

  return executeResolved<TIntent, WalletEnvelope>({
    resolvedIntent: input.resolvedIntent,
    recordInput: input.recordInput,
    history: historyStore,
    transport,
  });
}

export interface WalletEnvelope {
  preview: TransactionPreview;
  transactionId?: string;
  epoch?: number;
}

/** Poll the provider until the operation reaches a state the user can act on. */
export async function confirmOperation(record: OperationRecord, lookup: TransactionLookup): Promise<OperationRecord> {
  return confirmSubmitted({ record, history: historyStore, lookup });
}

/**
 * Reconcile a `PENDING` / `SUBMITTED` / `UNKNOWN` operation by durable id.
 *
 * There is deliberately no "retry" here. The protocol decides
 * `resubmissionAllowed` from an authoritative lookup, and the UI surfaces that
 * verdict.
 */
export async function reconcile(record: OperationRecord, lookup: TransactionLookup): Promise<{ record: OperationRecord; finalState: OperationRecord['state']; resubmissionAllowed: boolean; reason: string }> {
  const outcome = await reconcileOperation(record, lookup);
  // `reconcileOperation` does not persist; doing so here is the caller's job in
  // the protocol-client and the most common integration bug, so we do it once.
  await historyStore.save(outcome.record);
  return {
    record: outcome.record,
    finalState: outcome.finalState,
    resubmissionAllowed: outcome.resubmissionAllowed,
    reason: outcome.reason,
  };
}

export { requireFreshSubmissionAllowed };

/** Preview adapter for AMM intents built by the wallet-adapter wiring. */
export function ammPreview(preview: (intent: never) => TransactionPreview) {
  return (intent: unknown) => preview(intent as never);
}

export { toAmmPreview, toMarketplacePreview };
export type { SwapIntentBuilder, LiquidityIntentBuilder, MarketplaceRouteBuilder, FlowResult, OperationRecord };
