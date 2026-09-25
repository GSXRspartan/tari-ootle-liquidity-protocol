import { TransactionPreview } from './interface.js';

/**
 * Signer-agnostic marketplace call. A wallet adapter serializes, signs, and submits this intent;
 * these builders deliberately do not require walletd or custody of user keys.
 */
export interface MarketplaceCall {
  componentAddress?: string;
  templateName?: 'FixedPriceListing' | 'ItemOffer' | 'CollectionBid';
  method: string;
  args: unknown[];
  resourcesInvolved: string[];
}

export interface MarketplaceTransactionIntent {
  calls: MarketplaceCall[];
  privacyDisclosure: 'PUBLIC_NFT_PUBLIC_MARKET';
}

export interface CreateListingInput {
  templateAddress: string;
  sellerAccount: string;
  nftResource: string;
  nftId: string;
  quoteResource: string;
  price: string;
  expiryEpoch: number;
}

export interface CreateItemOfferInput {
  templateAddress: string;
  buyerAccount: string;
  nftResource: string;
  nftId: string;
  quoteResource: string;
  offerAmount: string;
  expiryEpoch: number;
}

export interface CreateCollectionBidInput {
  templateAddress: string;
  buyerAccount: string;
  collectionResource: string;
  quoteResource: string;
  pricePerNft: string;
  quantity: number;
  expiryEpoch: number;
}

function intent(calls: MarketplaceCall[]): MarketplaceTransactionIntent {
  return { calls, privacyDisclosure: 'PUBLIC_NFT_PUBLIC_MARKET' };
}

function preview(intentValue: MarketplaceTransactionIntent): TransactionPreview {
  const first = intentValue.calls[0];
  return {
    componentAddress: first.componentAddress ?? first.templateName,
    method: first.method,
    args: intentValue.calls,
    resourcesInvolved: [...new Set(intentValue.calls.flatMap((call) => call.resourcesInvolved))],
    estimatedOutputs: [],
    fee: 0,
    maxEpoch: 0,
    privacyDisclosure:
      'PUBLIC NFT / PUBLIC MARKET BOUNDARY: NFT identities, order amounts, and settlement are revealed.',
    networkName: '',
  };
}

export function createListing(input: CreateListingInput): MarketplaceTransactionIntent {
  return intent([
    {
      templateName: 'FixedPriceListing',
      method: 'create',
      args: [input.sellerAccount, input.nftResource, input.nftId, input.quoteResource, input.price, input.expiryEpoch],
      resourcesInvolved: [input.nftResource, input.quoteResource],
    },
  ]);
}

export function cancelListing(listingAddress: string): MarketplaceTransactionIntent {
  return intent([{ componentAddress: listingAddress, method: 'cancel', args: [], resourcesInvolved: [] }]);
}

export function buyListing(listingAddress: string, buyerAccount: string, quoteResource: string, amount: string): MarketplaceTransactionIntent {
  return intent([
    {
      componentAddress: listingAddress,
      method: 'buy',
      args: [buyerAccount, quoteResource, amount],
      resourcesInvolved: [quoteResource],
    },
  ]);
}

export function createItemOffer(input: CreateItemOfferInput): MarketplaceTransactionIntent {
  return intent([
    {
      templateName: 'ItemOffer',
      method: 'create',
      args: [input.buyerAccount, input.quoteResource, input.offerAmount, input.nftResource, input.nftId, input.expiryEpoch],
      resourcesInvolved: [input.nftResource, input.quoteResource],
    },
  ]);
}

export function cancelItemOffer(offerAddress: string): MarketplaceTransactionIntent {
  return intent([{ componentAddress: offerAddress, method: 'cancel', args: [], resourcesInvolved: [] }]);
}

export function acceptItemOffer(offerAddress: string, sellerAccount: string, nftResource: string, nftId: string): MarketplaceTransactionIntent {
  return intent([
    {
      componentAddress: offerAddress,
      method: 'accept',
      args: [sellerAccount, nftResource, nftId],
      resourcesInvolved: [nftResource],
    },
  ]);
}

export function refundExpiredItemOffer(offerAddress: string): MarketplaceTransactionIntent {
  return intent([{ componentAddress: offerAddress, method: 'refund_expired', args: [], resourcesInvolved: [] }]);
}

export function createCollectionBid(input: CreateCollectionBidInput): MarketplaceTransactionIntent {
  return intent([
    {
      templateName: 'CollectionBid',
      method: 'create',
      args: [
        input.buyerAccount,
        input.quoteResource,
        input.pricePerNft,
        input.collectionResource,
        input.quantity,
        input.expiryEpoch,
      ],
      resourcesInvolved: [input.collectionResource, input.quoteResource],
    },
  ]);
}

export function fillCollectionBid(bidAddress: string, sellerAccount: string, nftResource: string, nftId: string): MarketplaceTransactionIntent {
  return intent([
    {
      componentAddress: bidAddress,
      method: 'fill',
      args: [sellerAccount, nftResource, nftId],
      resourcesInvolved: [nftResource],
    },
  ]);
}

export function cancelCollectionBid(bidAddress: string): MarketplaceTransactionIntent {
  return intent([{ componentAddress: bidAddress, method: 'cancel', args: [], resourcesInvolved: [] }]);
}

export function refundExpiredCollectionBid(bidAddress: string): MarketplaceTransactionIntent {
  return intent([{ componentAddress: bidAddress, method: 'refund_expired', args: [], resourcesInvolved: [] }]);
}

/** Converts an intent into the existing adapter preview seam without selecting a wallet. */
export function toMarketplacePreview(intentValue: MarketplaceTransactionIntent): TransactionPreview {
  return preview(intentValue);
}
