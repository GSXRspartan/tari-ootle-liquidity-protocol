/**
 * Pool discovery.
 *
 * Pools are DISCOVERY data. A discovered pool is a candidate for viewing, never
 * an authority: the pool's reserves, fee, and LP supply always come from the
 * authoritative readback that the protocol-client's resolvers perform.
 *
 * With no configured discovery endpoint the registry is empty and the UI shows
 * an explicit unavailable state. It never synthesises a pool.
 */

import type { PoolPair, AssetSafetyClass, ResourceRoutingClass } from '@tari-ootle/protocol-client';
import { safetyFromPairClass, weakestClassification, toAssetChip, type AssetChip } from '../lib/assetIdentity.js';
import type { AppConfig } from './config.js';

export interface PoolDescriptor {
  poolComponent: string;
  pair: PoolPair;
  base: PoolAssetInfo;
  quote: PoolAssetInfo;
  feeBps?: string;
  /** The weakest classification across both assets; drives the pool's warning. */
  weakestSafety: ResourceRoutingClass;
}

export interface PoolAssetInfo {
  resourceAddress: string;
  symbol?: string;
  decimals: string;
  safetyClass: ResourceRoutingClass;
}

export interface PoolDiscoveryResult {
  pools: PoolDescriptor[];
  /** Present when discovery could not run or failed. Rendered verbatim. */
  unavailableReason?: string;
  source: string;
}

const SAFETY_VALUES: ReadonlySet<string> = new Set(['CANONICAL_TARI', 'PUBLIC_IMMUTABLE_OR_VETTED', 'ISSUER_CONTROLLED', 'UNKNOWN']);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readRaw(value: unknown): string | undefined {
  const text = readString(value);
  return text !== undefined && /^\d+$/.test(text) ? text : undefined;
}

/** Strictly validates one discovery record. A malformed record is dropped, not coerced. */
export function parsePoolDescriptor(raw: unknown): PoolDescriptor | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const poolComponent = readString(record.poolComponent ?? record.componentAddress);
  const resourceA = readString(record.resourceA);
  const resourceB = readString(record.resourceB);
  if (poolComponent === undefined || resourceA === undefined || resourceB === undefined) return undefined;

  const baseDecimals = readRaw(record.baseDecimals) ?? '0';
  const quoteDecimals = readRaw(record.quoteDecimals) ?? '0';
  const safetyClass: AssetSafetyClass = SAFETY_VALUES.has(String(record.safetyClass)) ? (record.safetyClass as AssetSafetyClass) : 'UNKNOWN';

  const baseSafety: ResourceRoutingClass =
    SAFETY_VALUES.has(String(record.baseSafetyClass)) ? (record.baseSafetyClass as ResourceRoutingClass) : safetyFromPairClass(safetyClass);
  const quoteSafety: ResourceRoutingClass =
    SAFETY_VALUES.has(String(record.quoteSafetyClass)) ? (record.quoteSafetyClass as ResourceRoutingClass) : safetyFromPairClass(safetyClass);

  const base: PoolAssetInfo = {
    resourceAddress: readString(record.baseResource) ?? resourceA,
    symbol: readString(record.baseSymbol),
    decimals: readRaw(record.baseDecimals) ?? baseDecimals,
    safetyClass: baseSafety,
  };
  const quote: PoolAssetInfo = {
    resourceAddress: readString(record.quoteResource) ?? resourceB,
    symbol: readString(record.quoteSymbol),
    decimals: readRaw(record.quoteDecimals) ?? quoteDecimals,
    safetyClass: quoteSafety,
  };

  const pair: PoolPair = {
    poolComponent,
    resourceA,
    resourceB,
    baseResource: base.resourceAddress,
    quoteResource: quote.resourceAddress,
    baseDecimals: base.decimals,
    quoteDecimals: quote.decimals,
    safetyClass,
  };
  const labelA = readString(record.baseSymbol);
  const labelB = readString(record.quoteSymbol);
  if (labelA !== undefined) pair.labelA = labelA;
  if (labelB !== undefined) pair.labelB = labelB;

  return {
    poolComponent,
    pair,
    base,
    quote,
    feeBps: readRaw(record.feeBps),
    weakestSafety: weakestClassification(baseSafety, quoteSafety),
  };
}

export function assetChipsOf(pool: PoolDescriptor): { base: AssetChip; quote: AssetChip } {
  return { base: toAssetChip(pool.base), quote: toAssetChip(pool.quote) };
}

export interface PoolDiscoverySource {
  readonly name: string;
  discover(): Promise<PoolDiscoveryResult>;
}

/**
 * Indexer-backed discovery. The expected payload is a JSON array (or
 * `{ data: [...] }`) of pool records. Anything else is reported as unavailable
 * rather than half-parsed.
 */
export class IndexerPoolDiscovery implements PoolDiscoverySource {
  readonly name: string;

  constructor(private readonly indexerUrl: string) {
    this.name = `indexer:${new URL(indexerUrl).host}`;
  }

  async discover(): Promise<PoolDiscoveryResult> {
    let response: Response;
    try {
      response = await fetch(this.indexerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'pool_discovery' }),
      });
    } catch (error) {
      return { pools: [], source: this.name, unavailableReason: `Pool discovery request failed: ${(error as Error).message}` };
    }
    if (!response.ok) {
      return { pools: [], source: this.name, unavailableReason: `Pool discovery endpoint returned HTTP ${response.status}.` };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { pools: [], source: this.name, unavailableReason: 'Pool discovery endpoint returned a non-JSON body.' };
    }
    const list = Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown[] })?.data) ? (payload as { data: unknown[] }).data : undefined;
    if (list === undefined) {
      return { pools: [], source: this.name, unavailableReason: 'Pool discovery response did not contain a pool list.' };
    }
    const pools = list.map(parsePoolDescriptor).filter((pool): pool is PoolDescriptor => pool !== undefined);
    return { pools, source: this.name };
  }
}

/** No discovery endpoint configured. The registry is legitimately empty. */
export class UnavailablePoolDiscovery implements PoolDiscoverySource {
  readonly name = 'unconfigured';

  async discover(): Promise<PoolDiscoveryResult> {
    return {
      pools: [],
      source: this.name,
      unavailableReason: 'No pool discovery endpoint is configured for this build. Deployments must provide one; no pool list is invented.',
    };
  }
}

export function createPoolDiscovery(config: AppConfig, fixtures: PoolDescriptor[] | undefined): PoolDiscoverySource {
  if (fixtures !== undefined) {
    return {
      name: 'development-fixture',
      async discover() {
        return { pools: fixtures, source: 'development-fixture' };
      },
    };
  }
  const url = config.indexerUrls[0];
  return url === undefined ? new UnavailablePoolDiscovery() : new IndexerPoolDiscovery(url);
}
