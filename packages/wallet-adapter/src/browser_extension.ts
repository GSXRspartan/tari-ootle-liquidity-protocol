import { WalletAdapter, WalletSession, NetworkInfo, AccountInfo, Balance, ResourceInfo, TransactionPreview, TransactionResult } from '\.\/interface';

export class BrowserExtensionWalletAdapter implements WalletAdapter {
  adapterName(): string { return 'BrowserExtensionSigner'; }
  adapterType(): 'extension' { return 'extension'; }

  async isSupported(): Promise<boolean> {
    try {
      // Check if extension is present (e.g., through global window or message testing)
      const hasExtension = typeof (globalThis as any).tariWalletExtension !== 'undefined';
      return !!hasExtension;
    } catch {
      return false;
    }
  }

  async connect(networkHint?: NetworkInfo): Promise<WalletSession> {
    const session: WalletSession = {
      adapterType: 'extension',
      connectedAt: new Date().toISOString(),
      network: networkHint || { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null },
      account: { address: 'extension-account-placeholder', accountIndex: 0, label: 'Extension' },
      supportedFeatures: ['connect', 'disconnect', 'getBalances', 'getResources', 'previewTransaction', 'signAndSubmit'],
      permissions: ['readBalances', 'signTransactions'],
    };
    return session;
  }

  async disconnect(): Promise<void> {
    // Revoke permissions through extension message if available
  }

  async getNetwork(): Promise<NetworkInfo> {
    return { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null };
  }

  async getAccounts(): Promise<AccountInfo[]> {
    return [{ address: 'ext-0', accountIndex: 0, label: 'Extension Account' }];
  }

  async getSelectedAccount(): Promise<AccountInfo> {
    return { address: 'ext-0', accountIndex: 0, label: 'Extension Account' };
  }

  async getBalances(): Promise<Balance[]> {
    return [];
  }

  async getResources(): Promise<ResourceInfo[]> {
    return [];
  }

  async previewTransaction(preview: Partial<TransactionPreview>): Promise<TransactionPreview> {
    const full: TransactionPreview = {
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
    return full;
  }

  async signAndSubmit(preview: TransactionPreview): Promise<TransactionResult> {
    // Actual extension message passing would occur here
    return {
      transactionId: 'tx-ext-' + Date.now(),
      epoch: 1,
      status: 'pending',
    };
  }

  async getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }> {
    return { status: 'pending', epoch: 1 };
  }
}
