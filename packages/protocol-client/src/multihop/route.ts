/**
 * Route-level state machine for composed routes.
 *
 * SEPARATE from the cross-layer session machine and from the AMM primitives on purpose: a
 * route is NOT a cross-layer session, and collapsing them is how composition bugs hide.
 *
 * Rules enforced here:
 *  - hop 2 may only become READY from a settlement proof (checked by hops.ts, required here
 *    as a state precondition);
 *  - a terminal route is terminal (no transition out);
 *  - a settled hop is never un-settled;
 *  - partial completion (hop 2 skipped) is a first-class outcome, not a failure.
 */
import { IllegalTransitionError } from '../crosschain/session.js';
import { requireIdentifier } from '../crosschain/types.js';
import { RouteEvent, RouteRecord, RouteState, TERMINAL_ROUTE_STATES } from './types.js';

/** Legal route transitions. Everything else is an IllegalTransitionError. */
const TRANSITIONS: Record<RouteState, Partial<Record<RouteEvent['kind'], RouteState>>> = {
  ROUTE_QUOTED: { ACCEPT_ROUTE: 'ROUTE_ACCEPTED', FAIL_TERMINAL: 'ROUTE_FAILED_TERMINAL' },
  ROUTE_ACCEPTED: { BEGIN_HOP1: 'HOP1_EXECUTING', PAUSE: 'ROUTE_PAUSED', FAIL_TERMINAL: 'ROUTE_FAILED_TERMINAL' },
  HOP1_EXECUTING: { HOP1_SETTLED: 'HOP1_SETTLED', HOP1_UNKNOWN: 'ROUTE_RECOVERY_REQUIRED', HOP1_FAILED: 'ROUTE_FAILED_TERMINAL' },
  HOP1_SETTLED: { BEGIN_HOP2_REQUOTE: 'HOP2_REQUOTE', SKIP_HOP2: 'HOP2_SKIPPED', PAUSE: 'ROUTE_PAUSED' },
  HOP2_REQUOTE: { HOP2_READY: 'HOP2_READY', REQUIRE_REQUOTE: 'ROUTE_PAUSED', HOP2_UNAVAILABLE: 'ROUTE_PAUSED', PAUSE: 'ROUTE_PAUSED' },
  HOP2_READY: { BEGIN_HOP2: 'HOP2_EXECUTING', PAUSE: 'ROUTE_PAUSED', FAIL_TERMINAL: 'ROUTE_FAILED_TERMINAL' },
  HOP2_EXECUTING: { HOP2_SETTLED: 'ROUTE_SETTLED', HOP2_UNKNOWN: 'ROUTE_RECOVERY_REQUIRED', HOP2_FAILED: 'ROUTE_FAILED_TERMINAL' },
  HOP2_SKIPPED: { SETTLE_PARTIAL: 'ROUTE_SETTLED', BEGIN_HOP2_REQUOTE: 'HOP2_REQUOTE' },
  ROUTE_SETTLED: {},
  ROUTE_PAUSED: { RESUME_REQUOTE: 'HOP2_REQUOTE', SKIP_HOP2: 'HOP2_SKIPPED', ENTER_RECOVERY: 'ROUTE_RECOVERY_REQUIRED', FAIL_TERMINAL: 'ROUTE_FAILED_TERMINAL' },
  ROUTE_RECOVERY_REQUIRED: { RESOLVE_CONTINUE: 'HOP2_REQUOTE', RESOLVE_SETTLED: 'ROUTE_SETTLED', RESOLVE_SKIP: 'HOP2_SKIPPED', FAIL_TERMINAL: 'ROUTE_FAILED_TERMINAL' },
  ROUTE_FAILED_TERMINAL: {},
};

export function isTerminalRouteState(state: RouteState): boolean {
  return TERMINAL_ROUTE_STATES.has(state);
}

export function allowedRouteTargets(record: RouteRecord, event: RouteEvent): RouteState | undefined {
  if (isTerminalRouteState(record.state)) return undefined;
  return TRANSITIONS[record.state][event.kind];
}

/** Pure validated transition. */
export function applyRouteEvent(record: RouteRecord, event: RouteEvent): RouteRecord {
  if (isTerminalRouteState(record.state)) {
    throw new IllegalTransitionError(`Illegal route transition: ${event.kind} from terminal state ${record.state}`);
  }
  const target = allowedRouteTargets(record, event);
  if (target === undefined) {
    throw new IllegalTransitionError(`Illegal route transition: ${event.kind} from ${record.state}`);
  }
  const next: RouteRecord = { ...record, state: target, updatedAtUnixMs: Date.now() };
  switch (event.kind) {
    case 'ACCEPT_ROUTE':
      return next;
    case 'BEGIN_HOP1': {
      const [hop1] = next.hops;
      if (!hop1) throw new IllegalTransitionError('route has no hop 1');
      hop1.execution = 'EXECUTING';
      return next;
    }
    case 'HOP1_SETTLED': {
      const [hop1] = next.hops;
      // A hop settles with the amount from the PROOF, never the quote.
      if (event.settledAmountRaw === undefined) throw new IllegalTransitionError('hop 1 settlement must carry the PROVEN settled amount');
      hop1.settlement = 'SETTLED';
      hop1.execution = 'CONFIRMED';
      hop1.settledAmountRaw = event.settledAmountRaw;
      next.settlementProof = event.proofRef;
      next.price.settledTariRaw = event.settledAmountRaw;
      return next;
    }
    case 'HOP1_UNKNOWN': {
      const [hop1] = next.hops;
      hop1.execution = 'UNKNOWN';
      hop1.failureReason = event.reason;
      return next;
    }
    case 'HOP1_FAILED': {
      const [hop1] = next.hops;
      hop1.execution = 'FAILED';
      hop1.settlement = 'FAILED_TERMINAL';
      hop1.failureReason = event.reason;
      next.failureReason = event.reason;
      return next;
    }
    case 'BEGIN_HOP2_REQUOTE':
      return next;
    case 'HOP2_READY': {
      const hop2 = next.hops[1];
      if (!hop2) throw new IllegalTransitionError('route has no hop 2');
      if (!hop2.safety.requiresSettlementProof) throw new IllegalTransitionError('hop 2 is not marked as requiring a settlement proof');
      if (next.settlementProof === undefined) {
        throw new IllegalTransitionError('hop 2 may not be READY without a hop-1 terminal settlement proof');
      }
      if (hop2.inputAmountRaw === undefined || hop2.inputAmountRaw === '' || BigInt(hop2.inputAmountRaw) <= 0n) {
        throw new IllegalTransitionError('hop 2 input amount must be the proven settled amount');
      }
      // The single-use binding: a proof may back exactly ONE hop-2 execution.
      if (next.proofConsumedByHop2 === true) {
        throw new IllegalTransitionError('hop-1 settlement proof has already been consumed by hop 2');
      }
      hop2.execution = 'NOT_STARTED';
      return next;
    }
    case 'BEGIN_HOP2': {
      const hop2 = next.hops[1];
      if (next.settlementProof === undefined) throw new IllegalTransitionError('hop 2 may not execute without a settlement proof');
      if (next.proofConsumedByHop2 === true) throw new IllegalTransitionError('hop 2 already consumed the settlement proof — double execution refused');
      hop2.execution = 'EXECUTING';
      hop2.operationId = event.operationId;
      next.proofConsumedByHop2 = true;
      return next;
    }
    case 'HOP2_SETTLED': {
      const hop2 = next.hops[1];
      hop2.execution = 'CONFIRMED';
      hop2.settlement = 'SETTLED';
      hop2.chainTxId = event.chainTxId;
      hop2.settledAmountRaw = event.settledAmountRaw;
      next.price.ammExpectedOutputRaw = event.settledAmountRaw;
      return next;
    }
    case 'HOP2_UNKNOWN': {
      const hop2 = next.hops[1];
      hop2.execution = 'UNKNOWN';
      hop2.failureReason = event.reason;
      return next;
    }
    case 'HOP2_FAILED': {
      const hop2 = next.hops[1];
      hop2.execution = 'FAILED';
      hop2.failureReason = event.reason;
      // A failed hop 2 does NOT lose the intermediate TARI — the route pauses, it does not
      // roll back a completed cross-layer trade.
      next.pause = { reason: 'AMM_LIQUIDITY_GONE', detail: event.reason, atUnixMs: Date.now() };
      return next;
    }
    case 'SKIP_HOP2':
      return next;
    case 'SETTLE_PARTIAL':
      return next;
    case 'PAUSE':
      next.pause = { reason: event.reason, detail: event.detail, atUnixMs: Date.now() };
      return next;
    case 'REQUIRE_REQUOTE':
      next.pause = { reason: 'INTERMEDIATE_SETTLED_REQUOTE_REQUIRED', detail: event.detail, atUnixMs: Date.now() };
      return next;
    case 'HOP2_UNAVAILABLE':
      next.pause = { reason: event.reason, detail: event.detail, atUnixMs: Date.now() };
      return next;
    case 'RESUME_REQUOTE':
      next.pause = undefined;
      return next;
    case 'ENTER_RECOVERY':
      next.pause = { reason: 'AMM_QUOTE_EXPIRED', detail: event.reason, atUnixMs: Date.now() };
      return next;
    case 'RESOLVE_CONTINUE':
      next.pause = undefined;
      return next;
    case 'RESOLVE_SETTLED': {
      const hop2 = next.hops[1];
      hop2.settlement = 'SETTLED';
      hop2.execution = 'CONFIRMED';
      return next;
    }
    case 'RESOLVE_SKIP':
      return next;
    case 'FAIL_TERMINAL':
      next.failureReason = event.reason;
      return next;
    default:
      return next;
  }
}

/** Validate a newly constructed route record before it can be used. */
export function validateRouteRecord(record: RouteRecord): void {
  requireIdentifier(record.routeId, 'routeId');
  if (record.hops.length !== 2) throw new IllegalTransitionError('this phase supports exactly 2 hops (FAST_XTM_TARI + AMM_SWAP)');
  const [hop1, hop2] = record.hops;
  if (hop1.kind !== 'FAST_XTM_TARI') throw new IllegalTransitionError('hop 1 must be FAST_XTM_TARI');
  if (hop2.kind !== 'AMM_SWAP') throw new IllegalTransitionError('hop 2 must be AMM_SWAP');
  if (hop1.index !== 0 || hop2.index !== 1) throw new IllegalTransitionError('hop indexes must be 0 and 1');
  if (hop1.outputAsset.resourceAddress !== hop2.inputAsset.resourceAddress) {
    throw new IllegalTransitionError('hop 1 output asset must equal hop 2 input asset (exact identity)');
  }
  if (hop1.inputAsset.resourceAddress !== record.sourceAsset.resourceAddress) {
    throw new IllegalTransitionError('hop 1 input asset must equal the route source asset');
  }
  if (hop2.outputAsset.resourceAddress !== record.destinationAsset.resourceAddress) {
    throw new IllegalTransitionError('hop 2 output asset must equal the route destination asset');
  }
  // The intermediate asset must be canonical TARI by exact identity.
  if (!hop2.inputAsset.isCanonicalTari || hop2.inputAsset.kind !== 'OOTLE_L2') {
    throw new IllegalTransitionError('the intermediate asset must be canonical TARI on Ootle L2');
  }
  if (hop2.safety.requiresSettlementProof !== true) {
    throw new IllegalTransitionError('hop 2 must require a settlement proof');
  }
  for (const raw of [record.totalExpectedOutputRaw, record.totalMinimumOutputRaw, record.acceptance.minimumFinalOutputRaw, record.acceptance.authorizedSourceAmountRaw]) {
    if (!/^\d+$/.test(raw)) throw new IllegalTransitionError(`amount ${raw} must be a raw non-negative integer string`);
  }
  if (BigInt(record.totalMinimumOutputRaw) > BigInt(record.totalExpectedOutputRaw)) {
    throw new IllegalTransitionError('total minimum output cannot exceed total expected output');
  }
  if (record.fees.developerTradingFeeRaw !== '0') {
    throw new IllegalTransitionError('developer trading fee must be exactly zero — this protocol has no rake');
  }
  // The hard floor is non-negotiable: the route minimum may not exceed the accepted minimum.
  if (BigInt(record.totalMinimumOutputRaw) < BigInt(record.acceptance.minimumFinalOutputRaw)) {
    throw new IllegalTransitionError('route minimum output is below the user-accepted minimum final output');
  }
}
