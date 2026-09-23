import { WalletAdapter, WalletSession, NetworkInfo, AccountInfo, Balance, ResourceInfo, TransactionPreview, TransactionResult } from '\.\/interface';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class EmbeddedOotleWalletAdapter implements WalletAdapter {
  adapterName(): string { return 'EmbeddedOotleWallet'; }
  adapterType(): 'embedded' { return 'embedded'; }

  constructor(private store: KeyValueStore) {}

  async isSupported(): Promise<boolean> {
    return true; // Always supported if SDK available
  }

  async connect(networkHint?: NetworkInfo): Promise<WalletSession> {
    const seedKey = await this.store.get('ootle_seed_entropy') || 'test-entropy-placeholder';
    return {
      adapterType: 'embedded',
      connectedAt: new Date().toISOString(),
      network: networkHint || { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null },
      account: { address: 'embedded-account', accountIndex: 0, label: 'Embedded' },
      supportedFeatures: ['connect', 'disconnect', 'getBalances', 'getResources', 'previewTransaction', 'signAndSubmit'],
      permissions: ['readBalances', 'signTransactions'],
    };
  }

  async disconnect(): Promise<void> {
    await this.store.remove('ootle_session_active');
  }

  async getNetwork(): Promise<NetworkInfo> {
    return { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null };
  }

  async getAccounts(): Promise<AccountInfo[]> {
    return [{ address: 'embedded-account', accountIndex: 0, label: 'Embedded' }];
  }

  async getSelectedAccount(): Promise<AccountInfo> {
    return { address: 'embedded-account', accountIndex: 0, label: 'Embedded' };
  }

  async getBalances(): Promise<Balance[]> {
    return [];
  }

  async getResources(): Promise<ResourceInfo[]> {
    return [];
  }

  async previewTransaction(preview: Partial<TransactionPreview>): Promise<TransactionPreview> {
    return {
      componentAddress: preview.componentAddress || '',
      method: preview.method || '',
      args: preview.args || [],
      resourcesInvolved: preview.resourcesInvolved || [],
      estimatedOutputs: preview.estimatedOutputs || [],
      fee: preview.fee || 30,
      maxEpoch: preview.maxEpoch || 100,
      privacyDisclosure: preview.privacyDisclosure || 'Pool reserves and amounts are revealed at AMM boundary.',
      networkName: 'esmeralda',
      ...preview,
    };
  }

  async signAndSubmit(preview: TransactionPreview): Promise<TransactionResult> {
    return {
      transactionId: 'tx-embedded-' + Date.now(),
      epoch: 1,
      status: 'pending',
    };
  }

  async getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }> {
    return { status: 'pending', epoch: 1 };
  }
}
