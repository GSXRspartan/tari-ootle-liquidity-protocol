/** Indexer-facing marketplace domain model. All grouping is by authoritative resource address. */
export interface FloorAsk {
  listingAddress: string;
  collectionResource: string;
  nftId: string;
  quoteResource: string;
  price: string;
  expiresAtEpoch: number;
}

export interface ItemOffer {
  offerAddress: string;
  buyerAccount: string;
  collectionResource: string;
  nftId: string;
  quoteResource: string;
  amount: string;
  expiresAtEpoch: number;
  status: 'ACTIVE' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
}

export interface CollectionBid {
  bidAddress: string;
  buyerAccount: string;
  collectionResource: string;
  quoteResource: string;
  pricePerNft: string;
  originalQuantity: number;
  remainingQuantity: number;
  originalEscrow: string;
  remainingEscrow: string;
  expiresAtEpoch: number;
  status: 'ACTIVE' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
}

export interface RecentSale {
  listingOrOfferAddress: string;
  collectionResource: string;
  nftId: string;
  quoteResource: string;
  amount: string;
  epoch: number;
}

export interface CollectionMarketData {
  collectionResource: string;
  quoteResource: string;
  floorAsk?: FloorAsk;
  bestBid?: CollectionBid;
  spread?: string;
  totalBidDepth: string;
  activeListings: FloorAsk[];
  itemOffers: ItemOffer[];
  collectionBids: CollectionBid[];
  recentSales: RecentSale[];
}

function normalizedDecimal(value: string): [string, string] {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`Invalid non-negative market amount: ${value}`);
  const [integer, fraction = ''] = value.split('.');
  return [integer.replace(/^0+(?=\d)/, ''), fraction.replace(/0+$/, '')];
}

function compareDecimal(left: string, right: string): number {
  const [leftInteger, leftFraction] = normalizedDecimal(left);
  const [rightInteger, rightFraction] = normalizedDecimal(right);
  if (leftInteger.length !== rightInteger.length) return leftInteger.length - rightInteger.length;
  if (leftInteger !== rightInteger) return leftInteger < rightInteger ? -1 : 1;
  const decimals = Math.max(leftFraction.length, rightFraction.length);
  const lhs = leftFraction.padEnd(decimals, '0');
  const rhs = rightFraction.padEnd(decimals, '0');
  return lhs === rhs ? 0 : lhs < rhs ? -1 : 1;
}

function addDecimal(left: string, right: string): string {
  const [leftInteger, leftFraction] = normalizedDecimal(left);
  const [rightInteger, rightFraction] = normalizedDecimal(right);
  const decimals = Math.max(leftFraction.length, rightFraction.length);
  const scale = 10n ** BigInt(decimals);
  const toScaled = (integer: string, fraction: string) => BigInt(integer) * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
  const sum = toScaled(leftInteger, leftFraction) + toScaled(rightInteger, rightFraction);
  const whole = sum / scale;
  const fractional = (sum % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

function subtractDecimal(left: string, right: string): string {
  if (compareDecimal(left, right) < 0) throw new Error('Market spread cannot be negative');
  const [leftInteger, leftFraction] = normalizedDecimal(left);
  const [rightInteger, rightFraction] = normalizedDecimal(right);
  const decimals = Math.max(leftFraction.length, rightFraction.length);
  const scale = 10n ** BigInt(decimals);
  const toScaled = (integer: string, fraction: string) => BigInt(integer) * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
  const difference = toScaled(leftInteger, leftFraction) - toScaled(rightInteger, rightFraction);
  const whole = difference / scale;
  const fractional = (difference % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

/**
 * Builds one quote-resource book. Callers must not mix Tari and wSTABLE books. Values are for
 * display/order selection only; a Sell Now flow must re-read the chosen bid on-chain before signing.
 */
export function buildCollectionMarketData(input: {
  collectionResource: string;
  quoteResource: string;
  listings: FloorAsk[];
  itemOffers: ItemOffer[];
  bids: CollectionBid[];
  recentSales: RecentSale[];
}): CollectionMarketData {
  const sameBook = <T extends { collectionResource: string; quoteResource: string }>(items: T[]) =>
    items.filter((item) => item.collectionResource === input.collectionResource && item.quoteResource === input.quoteResource);
  const activeListings = sameBook(input.listings).sort((a, b) => compareDecimal(a.price, b.price));
  const collectionBids = sameBook(input.bids)
    .filter((bid) => bid.status === 'ACTIVE' || bid.status === 'PARTIALLY_FILLED')
    .filter((bid) => bid.remainingQuantity > 0)
    .sort((a, b) => compareDecimal(b.pricePerNft, a.pricePerNft));
  const itemOffers = sameBook(input.itemOffers).filter((offer) => offer.status === 'ACTIVE');
  const recentSales = sameBook(input.recentSales);
  const floorAsk = activeListings[0];
  const bestBid = collectionBids[0];
  const totalBidDepth = collectionBids.reduce((sum, bid) => addDecimal(sum, bid.remainingEscrow), '0');

  return {
    collectionResource: input.collectionResource,
    quoteResource: input.quoteResource,
    floorAsk,
    bestBid,
    spread: floorAsk && bestBid ? subtractDecimal(floorAsk.price, bestBid.pricePerNft) : undefined,
    totalBidDepth,
    activeListings,
    itemOffers,
    collectionBids,
    recentSales,
  };
}

/** Selects a seller-chosen active bid; it deliberately does not assert global best price. */
export function selectSellNowBid(bids: CollectionBid[], bidAddress: string): CollectionBid {
  const bid = bids.find((candidate) => candidate.bidAddress === bidAddress);
  if (!bid || (bid.status !== 'ACTIVE' && bid.status !== 'PARTIALLY_FILLED') || bid.remainingQuantity === 0) {
    throw new Error('Selected collection bid is not fillable');
  }
  return bid;
}
