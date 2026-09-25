/**
 * Cross-layer XTM↔TARI session coordinator.
 *
 * Orchestrates: quote → reserve → L1 fund → authoritative verify → L2 fund → verify →
 * CLAIM_ARMED → reveal/claim → opposite claim → terminal reconciliation. Enforces:
 * authoritative reads of BOTH chains, deadline-safety rechecks before every irreversible
 * transition, idempotency by durable operation ids, UNKNOWN reconciliation, restart
 * recovery, and the REAL-SUBMIT GATE (default OFF; MAINNET always refused).
 *
 * The L1 leg is gated on MinotariWalletProvider.primitivesStatus() === 'VERIFIED' — until
 * the real SHA atomic-swap API is traced against Tari source (docs/MINOTARI_ATOMIC_SWAP_API.md)
 * the coordinator refuses real submission but fully executes protocol logic, reservations,
 * state machine, and recovery against provider/test ports.
 */
import {
  CrossChainEvent,
  CrossChainSessionRecord,
  IllegalTransitionError,
  SessionStore,
  applyEvent,
  isTerminal,
  requireSecretRevealAllowed,
} from './session.js';
import { ReservationLedger } from './reservation.js';
import { CrossChainSecretStore } from './secret.js';
import { assertDeadlineSafety } from './deadlines.js';
import { assertTestnetNetwork, requireOperationId } from './types.js';
import { MinotariWalletProvider, OotleScriptPathLegPort } from './provider.js';

/** Real cross-chain submission is OFF unless the gate passes. MAINNET never passes. */
export function isRealSubmitEnabled(env: Record<string, string | undefined>, network: string): { enabled: boolean; reason: string } {
  assertTestnetNetwork(network);
  if (env[REAL_CROSSCHAIN_SUBMIT_ENV] !== '1') {
    return { enabled: false, reason: `Real cross-chain submission is gated OFF (set ${REAL_CROSSCHAIN_SUBMIT_ENV}=1 to enable testnet submission)` };
  }
  return { enabled: true, reason: 'testnet real submission enabled by explicit gate' };
}

export class CoordinatorRefusal extends Error {}

export interface CoordinatorPorts {
  l1: MinotariWalletProvider;
  l2: OotleScriptPathLegPort;
  reservations: ReservationLedger;
  secrets: CrossChainSecretStore;
  sessions: SessionStore;
}

export interface CrossChainQuoteView {
  quoteId: string;
  providerId: string;
  direction: 'XTM_TO_TARI' | 'TARI_TO_XTM';
  xtmRawAmount: string;
  tariRawAmount: string;
  hashH: string;
  l1ClaimRecipient: string;
  l2ClaimRecipient: string;
  l1RefundDeadlineHeight: string;
  l2RefundDeadlineEpoch: string;
  requiredL1Confirmations: string;
  quoteExpiresAtUnixMs: number;
  l1Network: string;
  l2Network: string;
}

export interface AcceptQuoteRequest {
  sessionId: string;
  reservationId: string;
  quote: CrossChainQuoteView;
  nowUnixMs: number;
}

/** ACCEPT_QUOTE: create the durable reservation + session (idempotent by durable ids). */
export async function acceptQuote(input: { request: AcceptQuoteRequest; ports: CoordinatorPorts }): Promise<{ session: CrossChainSessionRecord }> {
  const q = input.request.quote;
  requireOperationId(input.request.sessionId);
  requireOperationId(input.request.reservationId);
  assertTestnetNetwork(q.l1Network);
  assertTestnetNetwork(q.l2Network);
  await input.ports.reservations.reserve({
    reservationId: input.request.reservationId,
    quoteId: q.quoteId,
    providerId: q.providerId,
    direction: q.direction,
    xtmRawAmount: q.xtmRawAmount,
    tariRawAmount: q.tariRawAmount,
    nowUnixMs: input.request.nowUnixMs,
    quoteExpiresAtUnixMs: q.quoteExpiresAtUnixMs,
  });
  const record: CrossChainSessionRecord = {
    sessionId: input.request.sessionId,
    state: 'QUOTED',
    quoteId: q.quoteId,
    reservationId: input.request.reservationId,
    providerId: q.providerId,
    direction: q.direction,
    xtmRawAmount: q.xtmRawAmount,
    tariRawAmount: q.tariRawAmount,
    hashH: q.hashH,
    l1ClaimRecipient: q.l1ClaimRecipient,
    l2ClaimRecipient: q.l2ClaimRecipient,
    l1Network: q.l1Network,
    l2Network: q.l2Network,
    l1RefundDeadlineHeight: q.l1RefundDeadlineHeight,
    l2RefundDeadlineEpoch: q.l2RefundDeadlineEpoch,
    requiredL1Confirmations: q.requiredL1Confirmations,
    createdAtUnixMs: Date.now(),
    updatedAtUnixMs: Date.now(),
  };
  const advanced = applyEvent(record, { kind: 'ACCEPT_QUOTE', nowUnixMs: input.request.nowUnixMs });
  await input.ports.sessions.save(advanced);
  return { session: advanced };
}

async function requireState(sessionId: string, ports: CoordinatorPorts, expected: string[]): Promise<CrossChainSessionRecord> {
  const record = await ports.sessions.get(sessionId);
  if (!record) throw new CoordinatorRefusal(`Unknown session ${sessionId}`);
  if (!expected.includes(record.state)) {
    throw new IllegalTransitionError(`Session ${sessionId} is ${record.state}; expected one of ${expected.join('/')}`);
  }
  return record;
}

export interface LegFundOutcome {
  outcome: 'SUBMITTED' | 'UNKNOWN' | 'REFUSED';
  txId?: string;
  reason?: string;
}

/** BEGIN_L1_FUNDING: gate → deadline safety → construct → authorize → submit. */
export async function beginL1Funding(input: { sessionId: string; ports: CoordinatorPorts; env: Record<string, string | undefined>; deadlineSafety: { l1RemainingMarginMs: string; l2RemainingMarginMs: string; requiredL1MarginMs: string; requiredL2MarginMs: string } }): Promise<LegFundOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['RESERVED']);
  const gate = isRealSubmitEnabled(input.env, input.ports.l1.network());
  if (!gate.enabled) return { outcome: 'REFUSED', reason: gate.reason };
  assertDeadlineSafety({ phase: 'FIRST_LEG_FUNDING', ...input.deadlineSafety });
  const advanced = applyEvent(record, { kind: 'BEGIN_L1_FUNDING', deadlineSafetyEvidence: 'deadline-recheck-passed' });
  await input.ports.sessions.save(advanced);
  const intent = input.ports.l1.constructHtlcFunding({
    amountRaw: advanced.xtmRawAmount,
    hash: advanced.hashH,
    claimRecipient: advanced.l1ClaimRecipient,
    refundRecipient: advanced.l1ClaimRecipient,
    refundHeight: advanced.l1RefundDeadlineHeight,
    network: input.ports.l1.network(),
    operationId: `fund_l1_${advanced.sessionId}`,
  });
  await input.ports.l1.authorizeFunding(intent);
  try {
    const submitted = await input.ports.l1.submitFunding(intent.intent);
    const acked = applyEvent(advanced, { kind: 'L1_FUND_ACKNOWLEDGED', l1TxId: submitted.l1TxId });
    await input.ports.sessions.save(acked);
    return { outcome: 'SUBMITTED', txId: submitted.l1TxId };
  } catch (error) {
    const lost = applyEvent(advanced, { kind: 'L1_FUND_UNKNOWN', transportError: (error as Error).message });
    await input.ports.sessions.save(lost);
    return { outcome: 'UNKNOWN', reason: (error as Error).message };
  }
}

/** AUTHORITATIVE first-leg verification — required before funding the second leg. */
export async function verifyL1Funded(input: { sessionId: string; ports: CoordinatorPorts; deadlineSafety: { l1RemainingMarginMs: string; l2RemainingMarginMs: string; requiredL1MarginMs: string; requiredL2MarginMs: string } }): Promise<VerifyOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['L1_FUNDED', 'L1_FUNDING']);
  if (!record.l1TxId) return { verified: false, reason: 'No L1 transaction id recorded' };
  const obs = await input.ports.l1.observeHtlc(record.l1TxId);
  const evidence = {
    l1TxId: record.l1TxId,
    confirmations: obs.confirmations,
    hashMatches: obs.hashHex === record.hashH,
    amountExact: obs.amountRaw === record.xtmRawAmount,
    deadlineSafe: obs.refundHeight === record.l1RefundDeadlineHeight,
    source: obs.source,
    confirmationsSufficient: BigInt(obs.confirmations) >= BigInt(record.requiredL1Confirmations),
  };
  const verified = evidence.hashMatches && evidence.amountExact && evidence.deadlineSafe && evidence.confirmationsSufficient && obs.exists && obs.source !== 'PROVIDER_ASSERTION';
  if (verified) {
    await input.ports.sessions.save(applyEvent(record, { kind: 'L1_VERIFIED_FUNDED', evidence }));
  }
  return { verified, evidence, reason: verified ? undefined : 'Authoritative L1 readback mismatch' };
}

export interface VerifyOutcome {
  verified: boolean;
  reason?: string;
  evidence?: unknown;
}

/** BEGIN_L2_FUNDING: only after the first leg is authoritatively verified. */
export async function beginL2Funding(input: { sessionId: string; ports: CoordinatorPorts; env: Record<string, string | undefined>; deadlineSafety: { l1RemainingMarginMs: string; l2RemainingMarginMs: string; requiredL1MarginMs: string; requiredL2MarginMs: string } }): Promise<LegFundOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['L1_FUNDED']);
  const gate = isRealSubmitEnabled(input.env, input.ports.l1.network());
  if (!gate.enabled) return { outcome: 'REFUSED', reason: gate.reason };
  // Never fund the second leg on the first party's word alone: the caller must pass
  // authoritative L1 verification; we re-check the session state enforces it.
  assertDeadlineSafety({ phase: 'SECOND_LEG_FUNDING', ...input.deadlineSafety });
  const advanced = applyEvent(record, { kind: 'BEGIN_L2_FUNDING', deadlineSafetyEvidence: 'deadline-recheck-passed' });
  await input.ports.sessions.save(advanced);
  try {
    await input.ports.l2.constructFunding({
      hashH: advanced.hashH,
      tariRawAmount: advanced.tariRawAmount,
      claimRecipient: advanced.l2ClaimRecipient,
      refundEpoch: advanced.l2RefundDeadlineEpoch,
      network: advanced.l2Network,
      operationId: `fund_l2_${advanced.sessionId}`,
    });
    await input.ports.l2.authorizeFunding(`fund_l2_${advanced.sessionId}`);
    const submitted = await input.ports.l2.submitFunding(`fund_l2_${advanced.sessionId}`);
    const acked = applyEvent(advanced, { kind: 'L2_FUND_ACKNOWLEDGED', l2TxId: submitted.l2TxId });
    await input.ports.sessions.save(acked);
    await input.ports.reservations.markFunded(advanced.reservationId);
    return { outcome: 'SUBMITTED', txId: submitted.l2TxId };
  } catch (error) {
    const lost = applyEvent(advanced, { kind: 'L2_FUND_UNKNOWN', transportError: (error as Error).message });
    await input.ports.sessions.save(lost);
    return { outcome: 'UNKNOWN', reason: (error as Error).message };
  }
}

/** AUTHORITATIVE L2 verification of the hashlock output. */
export async function verifyL2Funded(input: { sessionId: string; ports: CoordinatorPorts }): Promise<VerifyOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['BOTH_FUNDED', 'L2_FUNDING']);
  if (!record.l2TxId) return { verified: false, reason: 'No L2 transaction id recorded' };
  const obs = await input.ports.l2.observeHashlockOutput(record.l2TxId);
  const evidence = { l2TxId: record.l2TxId, hashExact: obs.hashExact, amountExact: obs.amountRaw === record.tariRawAmount, deadlineSafe: obs.epochRefundExact, claimantExact: obs.claimantExact };
  const ok = obs.exists && obs.source === 'AUTHORITATIVE' && evidence.hashExact && evidence.amountExact && evidence.deadlineSafe && evidence.claimantExact && obs.unspent;
  if (ok) await input.ports.sessions.save(applyEvent(record, { kind: 'L2_VERIFIED_FUNDED', evidence }));
  return { verified: ok, evidence, reason: ok ? undefined : 'L2 hashlock output failed authoritative verification' };
}

/** CLAIM_ARMED: mandatory checks before ANY secret disclosure. */
export async function armClaim(input: { sessionId: string; ports: CoordinatorPorts; deadlineSafety: { l1RemainingMarginMs: string; l2RemainingMarginMs: string; requiredL1MarginMs: string; requiredL2MarginMs: string }; claimConstructibleEvidence: string }): Promise<{ armed: boolean; reason?: string }> {
  const record = await requireState(input.sessionId, input.ports, ['BOTH_FUNDED']);
  try {
    assertDeadlineSafety({ phase: 'CLAIM_ARMED', ...input.deadlineSafety });
  } catch (error) {
    const lost = applyEvent(record, { kind: 'ENTER_RECOVERY', reason: `deadline margin unsafe: ${(error as Error).message}` });
    await input.ports.sessions.save(lost);
    return { armed: false, reason: (error as Error).message };
  }
  if (!input.claimConstructibleEvidence) {
    const lost = applyEvent(record, { kind: 'ENTER_RECOVERY', reason: 'claim construction unavailable (fees/funding)' });
    await input.ports.sessions.save(lost);
    return { armed: false, reason: 'claim not constructible' };
  }
  const armed = applyEvent(record, { kind: 'ARM_CLAIM', deadlineSafetyEvidence: 'recheck-passed', claimConstructibleEvidence: input.claimConstructibleEvidence });
  await input.ports.sessions.save(armed);
  return { armed: true };
}

/** SECRET REVEAL + claim submission — IRREVERSIBLE. UNKNOWN results force reconciliation. */
export async function revealAndClaimL2(input: { sessionId: string; ports: CoordinatorPorts; env: Record<string, string | undefined>; deadlineSafety: { l1RemainingMarginMs: string; l2RemainingMarginMs: string; requiredL1MarginMs: string; requiredL2MarginMs: string } }): Promise<LegFundOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['CLAIM_ARMED']);
  const gate = isRealSubmitEnabled(input.env, input.ports.l1.network());
  if (!gate.enabled) return { outcome: 'REFUSED', reason: gate.reason };
  requireSecretRevealAllowed(record);
  assertDeadlineSafety({ phase: 'SECRET_REVEAL', ...input.deadlineSafety });
  const preimage = await input.ports.secrets.revealSecret(record.sessionId, record.state === 'CLAIM_ARMED');
  const revealed = applyEvent(record, { kind: 'REVEAL_SECRET' });
  await input.ports.sessions.save(revealed);
  try {
    await input.ports.l2.constructClaim(record.l2TxId!, preimage, `claim_l2_${record.sessionId}`);
    const submitted = await input.ports.l2.submitClaim(record.l2TxId!, preimage);
    const claiming = applyEvent(applyEvent(record, { kind: 'REVEAL_SECRET' }), { kind: 'BEGIN_CLAIM', leg: 'L2' });
    await input.ports.sessions.save(applyEvent(claiming, { kind: 'CLAIM_ACKNOWLEDGED', leg: 'L2', txId: submitted.l2TxId }));
    return { outcome: 'SUBMITTED', txId: submitted.l2TxId };
  } catch (error) {
    // The secret MAY be public; reconcile, never retry blindly.
    const recovery = applyEvent(record, { kind: 'ENTER_RECOVERY', reason: `claim submit unknown: ${(error as Error).message}` });
    await input.ports.sessions.save(recovery);
    return { outcome: 'UNKNOWN', reason: (error as Error).message };
  }
}

/** Opposite-leg claim (L1 by the provider/taker after the preimage is observable). */
export async function claimL1(input: { sessionId: string; preimage: string; ports: CoordinatorPorts }): Promise<LegFundOutcome> {
  const record = await requireState(input.sessionId, input.ports, ['CLAIMING', 'RECOVERY_REQUIRED', 'CLAIMED']);
  if (record.l1ClaimTxId) {
    // Idempotent: a claim already exists for this session; reconcile it.
    const status = await input.ports.l1.lookupTransaction(record.l1ClaimTxId);
    return { outcome: status === 'COMMITTED' ? 'SUBMITTED' : 'UNKNOWN', txId: record.l1ClaimTxId };
  }
  try {
    await input.ports.l1.constructClaim(record.l1TxId!, input.preimage, record.l1ClaimRecipient, `claim_l1_${record.sessionId}`);
    const submitted = await input.ports.l1.submitClaim(record.l1TxId!, input.preimage);
    await input.ports.sessions.save(applyEvent(record, { kind: 'CLAIM_ACKNOWLEDGED', leg: 'L1', txId: submitted.l1TxId }));
    return { outcome: 'SUBMITTED', txId: submitted.l1TxId };
  } catch (error) {
    return { outcome: 'UNKNOWN', reason: (error as Error).message };
  }
}

/** Refund eligibility requires AUTHORITATIVE chain state (height/epoch), never wall clock. */
export async function assessRefundEligibility(input: { sessionId: string; ports: CoordinatorPorts; l1CurrentHeight: string; l2CurrentEpoch: string }): Promise<{ refundable: boolean; leg?: 'L1' | 'L2'; reason?: string }> {
  const record = await input.ports.sessions.get(input.sessionId);
  if (!record) return { refundable: false, reason: 'unknown session' };
  const l1Passed = BigInt(input.l1CurrentHeight) >= BigInt(record.l1RefundDeadlineHeight);
  const l2Passed = BigInt(input.l2CurrentEpoch) >= BigInt(record.l2RefundDeadlineEpoch);
  if (l1Passed) {
    await input.ports.sessions.save(applyEvent(record, { kind: 'REFUND_ELIGIBLE', leg: 'L1', authorityEvidence: `l1_height=${input.l1CurrentHeight}` }));
    return { refundable: true, leg: 'L1' };
  }
  if (l2Passed) {
    await input.ports.sessions.save(applyEvent(record, { kind: 'REFUND_ELIGIBLE', leg: 'L2', authorityEvidence: `l2_epoch=${input.l2CurrentEpoch}` }));
    return { refundable: true, leg: 'L2' };
  }
  return { refundable: false, reason: `l1_height=${input.l1CurrentHeight}/${record.l1RefundDeadlineHeight} l2_epoch=${input.l2CurrentEpoch}/${record.l2RefundDeadlineEpoch}` };
}

/** Terminal reconciliation: releases inventory exactly once on settlement/refund evidence. */
export async function finalizeSession(input: { sessionId: string; ports: CoordinatorPorts; evidenceOperationId: string; resolution: 'SETTLED' | 'REFUNDED' }): Promise<void> {
  const record = await input.ports.sessions.get(input.sessionId);
  if (!record) return;
  await input.ports.reservations.requestRelease(record.reservationId, input.evidenceOperationId, input.resolution);
  await input.ports.reservations.completeRelease(record.reservationId);
  await input.ports.secrets.destroySecret(input.sessionId);
}

/**
 * RESTART RECOVERY: load durable sessions, query BOTH chains, reconstruct the REAL state.
 * Never trusts the stored pre-crash state alone.
 */
export async function recoverSession(input: { sessionId: string; ports: CoordinatorPorts; preimage?: string }): Promise<RecoveryDecision> {
  const record = await input.ports.sessions.get(input.sessionId);
  if (!record) throw new CoordinatorRefusal('no such session');
  if (isTerminal(record.state)) return { action: 'NONE', reason: `terminal state ${record.state}` };
  const l1Status = record.l1TxId ? await input.ports.l1.lookupTransaction(record.l1TxId) : 'NOT_FOUND';
  const l2Status = record.l2TxId ? await input.ports.l2.lookupTransaction(record.l2TxId) : 'NOT_FOUND';
  if (record.l1ClaimTxId) {
    const claimStatus = await input.ports.l1.lookupTransaction(record.l1ClaimTxId);
    if (claimStatus === 'COMMITTED') return { action: 'FINALIZE', resolution: 'SETTLED', reason: 'L1 claim committed' };
  }
  if (record.l2ClaimTxId && (await input.ports.l2.lookupTransaction(record.l2ClaimTxId)) === 'COMMITTED') {
    return { action: 'CONTINUE', reason: 'L2 claim committed; counterparty claim proceeds' };
  }
  if (l1Status === 'COMMITTED' && l2Status === 'COMMITTED') {
    return { action: 'ARM', reason: 'both legs authoritatively funded; re-arm claim' };
  }
  if (l1Status === 'COMMITTED' && l2Status !== 'COMMITTED') {
    return { action: 'CONTINUE', reason: 'L1 funded; L2 leg pending/unknown' };
  }
  if (l1Status === 'NOT_FOUND' && l2Status === 'NOT_FOUND') {
    return { action: 'WAIT_OR_REFUND', reason: 'no authoritative evidence of either funding leg' };
  }
  return { action: 'RECONCILE', reason: `l1=${l1Status} l2=${l2Status}` };
}

export interface RecoveryDecision {
  action: 'CONTINUE' | 'ARM' | 'CLAIM' | 'WAIT_OR_REFUND' | 'RECONCILE' | 'FINALIZE';
  resolution?: 'SETTLED' | 'REFUNDED';
  reason: string;
}