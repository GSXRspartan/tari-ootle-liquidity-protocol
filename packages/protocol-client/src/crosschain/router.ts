/**
 * Router integration for the FAST_XTM_TARI cross-layer route.
 *
 * Single-hop in this phase. Composition seam (NOT implemented until failure semantics are
 * audited): XTM → FAST_XTM_TARI → TARI → AMM → wSTABLE. No unsafe multi-hop atomic
 * composition is implemented here.
 */
import { requirePositiveAmount } from './types.js';
import { ProviderAdvertisement, CrossChainQuote } from './quote.js';

export type RouteKind = 'FAST_XTM_TARI';

export interface RouteRequest {
  source: 'XTM' | 'TARI';
  destination: 'TARI' | 'XTM';
  amountRaw: string;
  network: string;
}

export interface RouteResult {
  routeKind: RouteKind;
  provider: ProviderAdvertisement;
  quote: CrossChainQuote;
  /** Exact input/output in raw integer units (BigInt strings). */
  inputAmount: string;
  expectedOutput: string;
  estimatedNetworkFeeL1?: string;
  estimatedNetworkFeeL2?: string;
  requiredL1Confirmations: string;
  quoteExpiresAtUnixMs: number;
  routeState: 'RESOLVABLE' | 'UNAVAILABLE';
  routeStateReason?: string;
  fundingProgress: { l1Funded: boolean; l2Funded: boolean; claimArmed: boolean; claimed: boolean; refunded: boolean };
}

export function routeResult(input: { request: RouteRequest; ad: ProviderAdvertisement; quote: CrossChainQuote }): RouteResult {
  const validPair =
    (input.request.source === 'XTM' && input.request.destination === 'TARI') ||
    (input.request.source === 'TARI' && input.request.destination === 'XTM');
  if (!validPath(validPair)) throw new Error(`Unsupported route ${input.request.source} → ${input.request.destination}`);
  requirePositiveAmount(input.request.amountRaw, 'amountRaw');
  return {
    routeKind: 'FAST_XTM_TARI',
    provider: input.ad,
    quote: input.quote,
    inputAmount: input.request.amountRaw,
    expectedOutput: input.request.source === 'XTM' ? input.quote.tariRawAmount : input.quote.xtmRawAmount,
    requiredL1Confirmations: input.ad.requiredL1Confirmations,
    quoteExpiresAtUnixMs: input.quote.quoteExpiresAtUnixMs,
    routeState: 'RESOLVABLE',
    fundingProgress: { l1Funded: false, l2Funded: false, claimArmed: false, claimed: false, refunded: false },
  };
}

function validPath(ok: boolean): boolean {
  return ok;
}