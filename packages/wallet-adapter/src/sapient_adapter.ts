import { WalletAdapter, WalletSession, NetworkInfo, AccountInfo, Balance, ResourceInfo, TransactionPreview, TransactionResult } from '\.\/interface';

export class SapientConnectionNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SapientConnectionNotSupported';
  }
}

export class SapientWalletAdapter implements WalletAdapter {
  adapterName(): string { return 'SapientAdapter'; }
  adapterType(): 'sapient' { return 'sapient'; }

  async isSupported(): Promise<boolean> {
    // No stable public dApp connection API detected
    return false;
  }

  async connect(networkHint?: NetworkInfo): Promise<WalletSession> {
    throw new SapientConnectionNotSupported(
      'Sapient wallet adapter is not supported: upstream does not expose a stable public dApp message protocol. ' +
      'See docs/SAPIENT_INTEGRATION.md for exact missing functionality and adapter interface.'
    );
  }

  async disconnect(): Promise<void> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getNetwork(): Promise<NetworkInfo> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getAccounts(): Promise<AccountInfo[]> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getSelectedAccount(): Promise<AccountInfo> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getBalances(): Promise<Balance[]> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getResources(): Promise<ResourceInfo[]> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async previewTransaction(preview: Partial<TransactionPreview>): Promise<TransactionPreview> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async signAndSubmit(preview: TransactionPreview): Promise<TransactionResult> {
    throw new SapientConnectionNotSupported('Not connected');
  }

  async getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }> {
    throw new SapientConnectionNotSupported('Not connected');
  }
}
