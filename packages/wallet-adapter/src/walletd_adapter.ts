import { WalletAdapter, WalletSession, NetworkInfo, AccountInfo, Balance, ResourceInfo, TransactionPreview, TransactionResult } from '\.\/interface';

export class WalletDaemonAdapter implements WalletAdapter {
  adapterName(): string { return 'WalletDaemonSigner'; }
  adapterType(): 'walletd' { return 'walletd'; }

  constructor(private daemonUrl: string = 'http://localhost:5100/json_rpc') {}

  async isSupported(): Promise<boolean> {
    try {
      const res = await fetch(this.daemonUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'get_version', id: 1 }) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async connect(networkHint?: NetworkInfo): Promise<WalletSession> {
    return {
      adapterType: 'walletd',
      connectedAt: new Date().toISOString(),
      network: networkHint || { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null },
      account: { address: 'walletd-account', accountIndex: 0, label: 'Wallet Daemon' },
      supportedFeatures: ['connect', 'disconnect', 'getBalances', 'getResources', 'previewTransaction', 'signAndSubmit'],
      permissions: ['fullAccess'],
    };
  }

  async disconnect(): Promise<void> {
    // walletd does not have a disconnect mechanism; session expires independently
  }

  async getNetwork(): Promise<NetworkInfo> {
    return { name: 'esmeralda', indexerUrls: ['https://indexer.esmeralda.tari.com'], nativeResourceAddress: null };
  }

  async getAccounts(): Promise<AccountInfo[]> {
    return [{ address: 'walletd-account', accountIndex: 0, label: 'Wallet Daemon' }];
  }

  async getSelectedAccount(): Promise<AccountInfo> {
    return { address: 'walletd-account', accountIndex: 0, label: 'Wallet Daemon' };
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
      transactionId: 'tx-walletd-' + Date.now(),
      epoch: 1,
      status: 'pending',
    };
  }

  async getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }> {
    return { status: 'pending', epoch: 1 };
  }
}
