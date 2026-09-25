/**
 * Concrete Ootle readback provider for authoritative chain reads.
 *
 * Transport is injected (`AuthoritativeSubstateReader`): walletd, an embedded wallet, or a
 * browser provider implements it. Indexers must NOT be plugged in here — discovery stays in
 * the discovery providers.
 *
 * All on-chain amounts are decimal strings (u64/u128 raw units). No JS number ever carries
 * an on-chain value.
 */
import {
  ExecutionAuthoritativeRead,
  Freshness,
  FreshnessIdentity,
  isAuthoritativeSource,
  ReadSource,
} from './execution.js';
import { Listing, ItemOffer, CollectionBid } from './marketplace.js';

// ---------------------------------------------------------------------------
// Pool readback
// ---------------------------------------------------------------------------

export interface PoolState {
  poolComponent: string;
  /** Canonical (engine-ordered) resource pair — identity is the exact ResourceAddress. */
  resourceA: string;
  resourceB: string;
  reserveA: string;
  reserveB: string;
  feeBps: string;
  lpResource: string;
  totalLpSupply: string;
  lockedLpSupply: string;
}

export type PoolReadStatus = 'ACTIVE' | 'STALE' | 'UNAVAILABLE' | 'CONFLICTED';

export interface OotleSubstateEnvelope {
  /** Component or resource address actually read. */
  address: string;
  /** Template name the component instantiates (must match exactly — never by symbol). */
  templateName?: string;
  /** Engine-exposed state version / component version, when available. */
  substateVersion?: string;
  producingTxHash?: string;
  epoch?: string;
  /** The authoritative payload as returned by the transport (template fields, stringified). */
  fields: Record<string, string>;
}

/**
 * The minimal authoritative transport. Implementations: walletd RPC, wallet-daemon, browser
 * extension provider, or a test double. Must return the CURRENT committed component state.
 */
export interface AuthoritativeSubstateReader {
  readComponent(address: string): Promise<OotleSubstateEnvelope | undefined>;
  readResource?(address: string): Promise<OotleSubstateEnvelope | undefined>;
}

function freshness(envelope: EnvelopeInput): Freshness {
  const identity: FreshnessIdentity = {
    substateVersion: envelope.substateVersion,
    producingTxHash: envelope.producingTxHash,
    epoch: envelope.epoch,
    stateIdentity: envelope.templateName ? `${envelope.address}@${envelope.templateName}` : envelope.address,
    readAtUnixMs: Date.now(),
  };
  return { source: envelope.source, identity };
}

type EnvelopeInput = OotleSubstateEnvelope & { source: ReadSource };

/** Field accessors: the transport stringifies everything; parse strictly. */
function field(envelope: EnvelopeInput, name: string): string {
  const raw = envelope.fields[name];
  if (raw === undefined || raw === null) throw new Error(`Authoritative read of ${envelope.address} is missing field ${name}`);
  return String(raw);
}

/** Readback provider interface for pools (separate from any pool discovery/search). */
export interface PoolReadbackProvider {
  readPool(poolComponent: string): Promise<ExecutionAuthoritativeRead<PoolState>>;
}

export function parsePoolState(envelope: EnvelopeInput): PoolState {
  const state: PoolState = {
    poolComponent: envelope.address,
    resourceA: field(envelope, 'resource_a'),
    resourceB: field(envelope, 'resource_b'),
    reserveA: field(envelope, 'reserve_a'),
    reserveB: field(envelope, 'reserve_b'),
    feeBps: field(envelope, 'fee_bps'),
    lpResource: field(envelope, 'lp_resource'),
    totalLpSupply: field(envelope, 'total_lp_supply'),
    lockedLpSupply: field(envelope, 'locked_lp_supply'),
  };
  return state;
}

export interface OotleReadbackProvider extends PoolReadbackProvider {
  readListing(listingAddress: string): Promise<ExecutionAuthoritativeRead<Listing>>;
  readItemOffer(offerAddress: string): Promise<ExecutionAuthoritativeRead<ItemOffer>>;
  readCollectionBid(bidAddress: string): Promise<ExecutionAuthoritativeRead<CollectionBid>>;
}

/**
 * Production readback provider over the injected authoritative reader.
 * Template identity is checked by NAME at the component level; resource identity is always
 * the exact address carried in the payload.
 */
export function createOotleReadbackProvider(reader: AuthoritativeSubstateReader, source: ReadSource): OotleReadbackProvider {
  if (!isAuthoritativeSource(source)) {
    throw new Error('Ootle readback must be backed by an authoritative source (CHAIN_NODE or WALLET_PROVIDER)');
  }
  async function readEnvelope(address: string, expectedTemplate: string): Promise<ExecutionAuthoritativeRead<EnvelopeInput>> {
    let envelope: OotleSubstateEnvelope | undefined;
    try {
      envelope = await reader.readComponent(address);
    } catch (error) {
      return { status: 'UNAVAILABLE', reason: `Authoritative read failed: ${(error as Error).message}` };
    }
    if (!envelope) return { status: 'UNAVAILABLE', reason: `Component ${address} does not exist` };
    if (expectedTemplate && envelope.templateName && envelope.templateName !== expectedTemplate) {
      return { status: 'UNAVAILABLE', reason: `Component ${address} is template ${envelope.templateName}, expected ${expectedTemplate}` };
    }
    const withSource: EnvelopeInput = { ...envelope, source };
    return { status: 'FOUND', value: withSource, freshness: freshness(withSource) };
  }
  return {
    async readPool(poolComponent: string): Promise<ExecutionAuthoritativeRead<PoolState>> {
      const read = await readEnvelope(poolComponent, 'Pool');
      if (read.status === 'UNAVAILABLE') return { status: 'UNAVAILABLE', reason: read.reason };
      try {
        return { status: 'FOUND', value: parsePoolState(read.value), freshness: read.freshness };
      } catch (error) {
        return { status: 'UNAVAILABLE', reason: (error as Error).message };
      }
    },
    async readListing(address: string): Promise<ExecutionAuthoritativeRead<Listing>> {
      const read = await readEnvelope(address, 'FixedPriceListing');
      if (read.status === 'UNAVAILABLE') return { status: 'UNAVAILABLE', reason: read.reason };
      const e = read.value;
      return {
        status: 'FOUND',
        value: {
          listingAddress: e.address,
          sellerAccount: field(e, 'seller_account'),
          collectionResource: field(e, 'collection_resource'),
          nftId: field(e, 'nft_id'),
          quoteResource: field(e, 'quote_resource'),
          price: field(e, 'price'),
          createdAtEpoch: optionalField(e, 'created_at_epoch'),
          expiresAtEpoch: field(e, 'expires_at_epoch'),
          status: normalizeStatus(field(e, 'status'), ['ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED'], 'ACTIVE'),
        },
        freshness: read.freshness,
      };
    },
    async readItemOffer(address: string): Promise<ExecutionAuthoritativeRead<ItemOffer>> {
      const read = await readEnvelope(address, 'ItemOffer');
      if (read.status === 'UNAVAILABLE') return { status: 'UNAVAILABLE', reason: read.reason };
      const e = read.value;
      return {
        status: 'FOUND',
        value: {
          offerAddress: e.address,
          buyerAccount: field(e, 'buyer_account'),
          collectionResource: field(e, 'collection_resource'),
          nftId: field(e, 'nft_id'),
          quoteResource: field(e, 'quote_resource'),
          amount: field(e, 'amount'),
          createdAtEpoch: field(e, 'created_at_epoch'),
          expiresAtEpoch: field(e, 'expires_at_epoch'),
          status: normalizeStatus(field(e, 'status'), ['ACTIVE', 'ACCEPTED', 'CANCELLED', 'EXPIRED'], 'ACTIVE'),
        },
        freshness: read.freshness,
      };
    },
    async readCollectionBid(address: string): Promise<ExecutionAuthoritativeRead<CollectionBid>> {
      const read = await readEnvelope(address, 'CollectionBid');
      if (read.status === 'UNAVAILABLE') return { status: 'UNAVAILABLE', reason: read.reason };
      const e = read.value;
      return {
        status: 'FOUND',
        value: {
          bidAddress: e.address,
          buyerAccount: field(e, 'buyer_account'),
          collectionResource: field(e, 'collection_resource'),
          quoteResource: field(e, 'quote_resource'),
          pricePerNft: field(e, 'price_per_nft'),
          originalQuantity: field(e, 'original_quantity'),
          remainingQuantity: field(e, 'remaining_quantity'),
          originalEscrow: field(e, 'original_escrow'),
          remainingEscrow: field(e, 'remaining_escrow'),
          createdAtEpoch: field(e, 'created_at_epoch'),
          expiresAtEpoch: field(e, 'expires_at_epoch'),
          status: normalizeStatus(field(e, 'status'), ['ACTIVE', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED'], 'ACTIVE'),
        },
        freshness: read.freshness,
      };
    },
  };
}

function optionalField(e: EnvelopeInput, name: string): string | undefined {
  const raw = e.fields[name];
  return raw === undefined || raw === null ? undefined : String(raw);
}

function normalizeStatus<T extends string>(raw: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(raw) ? (raw as T) : fallback;
}


