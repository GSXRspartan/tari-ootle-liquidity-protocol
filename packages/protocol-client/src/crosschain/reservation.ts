/**
 * Durable cross-chain inventory reservation.
 *
 * A provider advertising 100,000 XTM must not allow two accepted 80,000-XTM swaps to both
 * believe the inventory is theirs. Reservations are per-provider, idempotent by
 * reservationId, and race-checked against cumulative reserved totals. Terminal release
 * happens ONLY on authoritative settlement/refund evidence — quote expiry alone never
 * releases inventory that may already be funded.
 */
import { requireRawAmount, requireOperationId, SwapDirection } from './types.js';
import { ProviderAdvertisement, validateAdvertisement } from './quote.js';

export type InventoryState = 'AVAILABLE' | 'RESERVED' | 'FUNDED' | 'RELEASE_PENDING' | 'RELEASED';

export interface Reservation {
  reservationId: string;
  providerId: string;
  quoteId: string;
  direction: SwapDirection;
  xtmRawAmount: string;
  tariRawAmount: string;
  state: InventoryState;
  createdAtUnixMs: number;
  /** Wall-clock quote expiry — only governs UNFUNDED reservations. */
  quoteExpiresAtUnixMs: number;
  releasedAtUnixMs?: number;
  releaseReason?: string;
}

export interface ReservationLedger {
  advertisement(providerId: string): ProviderAdvertisement;
  reserve(input: {
    reservationId: string;
    quoteId: string;
    providerId: string;
    direction: SwapDirection;
    xtmRawAmount: string;
    tariRawAmount: string;
    nowUnixMs: number;
    quoteExpiresAtUnixMs: number;
  }): Promise<Reservation>;
  get(reservationId: string): Promise<Reservation | undefined>;
  listByProvider(providerId: string): Promise<Reservation[]>;
  markFunded(reservationId: string): Promise<Reservation>;
  requestRelease(reservationId: string, evidenceOperationId: string, reason: 'SETTLED' | 'REFUNDED' | 'QUOTE_EXPIRED'): Promise<Reservation>;
  completeRelease(reservationId: string): Promise<Reservation>;
}

/**
 * Reference in-memory ledger with cumulative per-provider reserved totals. Real providers
 * implement the same interface over their own durable store — the INVARIANT is in the
 * transitions, not the storage.
 */
export class InMemoryReservationLedger implements ReservationLedger {
  private readonly reservedXtm = new Map<string, bigint>();
  private readonly reservedTari = new Map<string, bigint>();
  private readonly reservations = new Map<string, Reservation>();

  constructor(private readonly ads: Record<string, ProviderAdvertisement>) {}

  advertisement(providerId: string): ProviderAdvertisement {
    const ad = this.ads[providerId];
    if (!ad) throw new Error(`Unknown provider ${providerId}`);
    validateAdvertisement(ad);
    return ad;
  }

  async reserve(input: {
    reservationId: string;
    quoteId: string;
    providerId: string;
    direction: SwapDirection;
    xtmRawAmount: string;
    tariRawAmount: string;
    nowUnixMs: number;
    quoteExpiresAtUnixMs: number;
  }): Promise<Reservation> {
    requireOperationId(input.reservationId);
    const ad = this.advertisement(input.providerId);
    const xtm = requireRawAmount(input.xtmRawAmount, 'xtmRawAmount');
    const tari = requireRawAmount(input.tariRawAmount, 'tariRawAmount');
    if (xtm === 0n && tari === 0n) throw new Error('Reservation amounts cannot both be zero');
    const existing = this.reservations.get(input.reservationId);
    if (existing) {
      // Idempotent retry: identical terms return the same reservation.
      if (existing.quoteId === input.quoteId && existing.providerId === input.providerId) {
        if (existing.xtmRawAmount !== xtm.toString() || existing.tariRawAmount !== tari.toString()) {
          throw new Error(`Reservation ${input.reservationId} already exists with different terms`);
        }
        return existing;
      }
      throw new Error(`Reservation ${input.reservationId} already exists with different terms`);
    }
    // Inventory race protection: cumulative reserved totals per asset must stay within
    // the advertised inventory for THIS provider.
    const reservedXtm = (this.reservedXtm.get(input.providerId) ?? 0n) + xtm;
    const reservedTari = BigInt(this.reservedTari.get(input.providerId) ?? 0n) + tari;
    if (reservedXtm > BigInt(ad.xtmAvailable)) {
      throw new Error(`Inventory race: reserved XTM would exceed ${input.providerId}'s advertised ${ad.xtmAvailable}`);
    }
    if (reservedTari > BigInt(ad.tariAvailable)) {
      throw new Error(`Inventory race: reserved TARI exceeds ${input.providerId}'s advertised ${ad.tariAvailable}`);
    }
    const reservation: Reservation = {
      reservationId: input.reservationId,
      providerId: input.providerId,
      quoteId: input.quoteId,
      direction: input.direction,
      xtmRawAmount: xtm.toString(),
      tariRawAmount: tari.toString(),
      state: 'RESERVED',
      createdAtUnixMs: input.nowUnixMs,
      quoteExpiresAtUnixMs: input.quoteExpiresAtUnixMs,
    };
    this.reservedXtm.set(input.providerId, (this.reservedXtm.get(input.providerId) ?? 0n) + xtm);
    this.reservedTari.set(input.providerId, (this.reservedTari.get(input.providerId) ?? 0n) + tari);
    this.reservations.set(input.reservationId, reservation);
    return reservation;
  }

  async get(reservationId: string): Promise<Reservation | undefined> {
    const r = this.reservations.get(reservationId);
    return r ? { ...r } : undefined;
  }

  async listByProvider(providerId: string): Promise<Reservation[]> {
    return [...this.reservations.values()].filter((r) => r.providerId === providerId).map((r) => ({ ...r }));
  }

  /** FUNDED — only the coordinator may set this, after authoritative first-leg evidence. */
  async markFunded(reservationId: string): Promise<Reservation> {
    const r = this.mustGet(reservationId);
    if (r.state !== 'RESERVED') throw new Error(`Cannot mark FUNDED from state ${r.state}`);
    const updated: Reservation = { ...r, state: 'FUNDED' };
    this.reservations.set(reservationId, updated);
    return updated;
  }

  /**
   * Release request: the coordinator calls this ONLY with the authoritative evidence tag.
   * Quote expiry may release ONLY an unfunded reservation.
   */
  async requestRelease(reservationId: string, evidenceOperationId: string, reason: 'SETTLED' | 'REFUNDED' | 'QUOTE_EXPIRED'): Promise<Reservation> {
    requireOperationId(evidenceOperationId);
    const r = this.mustGet(reservationId);
    if (r.state === 'RELEASED') return r;
    if (r.state === 'RELEASE_PENDING') {
      if (r.releaseReason === `${reason}:${evidenceOperationId}`) return r;
      throw new Error('Conflicting concurrent release for the same reservation');
    }
    if (reason === 'QUOTE_EXPIRED' && r.state !== 'RESERVED') {
      throw new Error(`Quote expiry may release only an UNFUNDED reservation (state ${r.state}); funded sessions live by chain deadlines`);
    }
    const updated: Reservation = { ...r, state: 'RELEASE_PENDING', releaseReason: `${reason}:${evidenceOperationId}` };
    this.reservations.set(reservationId, updated);
    return updated;
  }

  /** Terminal release: decrements per-provider reserved inventory exactly once. */
  async completeRelease(reservationId: string): Promise<Reservation> {
    const r = this.mustGet(reservationId);
    if (r.state !== 'RELEASE_PENDING') throw new Error(`completeRelease requires RELEASE_PENDING, got ${r.state}`);
    const xtm = BigInt(r.xtmRawAmount);
    const tari = BigInt(r.tariRawAmount);
    this.reservedXtm.set(r.providerId, (this.reservedXtm.get(r.providerId) ?? 0n) - xtm);
    this.reservedTari.set(r.providerId, (this.reservedTari.get(r.providerId) ?? 0n) - tari);
    if ((this.reservedXtm.get(r.providerId) ?? 0n) < 0n || (this.reservedTari.get(r.providerId) ?? 0n) < 0n) {
      throw new Error('Reservation ledger would go negative — accounting bug');
    }
    const updated: Reservation = { ...r, state: 'RELEASED', releasedAtUnixMs: Date.now() };
    this.reservations.set(reservationId, updated);
    return updated;
  }

  private mustGet(reservationId: string): Reservation {
    const r = this.reservations.get(reservationId);
    if (!r) throw new Error(`Unknown reservation ${reservationId}`);
    return r;
  }
}