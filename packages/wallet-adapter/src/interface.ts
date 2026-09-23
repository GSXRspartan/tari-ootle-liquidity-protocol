export interface NetworkInfo {
  name: string;
  indexerUrls: string[];
  nativeResourceAddress: string | null;
}

export interface AccountInfo {
  address: string;
  accountIndex: number;
  label?: string;
}

export interface Balance {
  resourceAddress: string;
  amount: string; // decimal string for precision
  resourceType: 'fungible' | 'confidential' | 'stealth' | 'non_fungible';
}

export interface ResourceInfo {
  address: string;
  type: string;
  symbol?: string;
  decimals?: number;
}

export interface TransactionPreview {
  componentAddress?: string;
  method?: string;
  args: unknown[];
  resourcesInvolved: string[];
  estimatedOutputs: { resource: string; amount: string }[];
  fee: number; // basis points
  maxEpoch: number;
  privacyDisclosure: string;
  networkName: string;
}

export interface TransactionResult {
  transactionId: string;
  epoch: number;
  status: 'success' | 'rejected' | 'pending';
  error?: string;
}

export interface WalletSession {
  adapterType: 'extension' | 'mobile' | 'sapient' | 'walletd' | 'embedded';
  connectedAt: string;
  network: NetworkInfo;
  account: AccountInfo;
  supportedFeatures: string[];
  permissions: string[];
}

export interface WalletAdapter {
  adapterName(): string;
  adapterType(): 'extension' | 'mobile' | 'sapient' | 'walletd' | 'embedded';

  isSupported(): Promise<boolean>;

  connect(networkHint?: NetworkInfo): Promise<WalletSession>;

  disconnect(): Promise<void>;

  getNetwork(): Promise<NetworkInfo>;

  getAccounts(): Promise<AccountInfo[]>;

  getSelectedAccount(): Promise<AccountInfo>;

  getBalances(): Promise<Balance[]>;

  getResources(): Promise<ResourceInfo[]>;

  previewTransaction(preview: Partial<TransactionPreview>): Promise<TransactionPreview>;

  signAndSubmit(preview: TransactionPreview): Promise<TransactionResult>;

  getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }>;
}

export interface AdapterFactory {
  name: string;
  create(): WalletAdapter;
}
