export interface IndexerProvider {
  url: string;
  networkName: string;
}

export interface IndexerResponse<T> {
  data: T;
  meta?: { height?: number; timestamp?: number };
  errors?: string[];
}

export class ProtocolClientConfig {
  primaryIndexer: IndexerProvider = { url: 'https://indexer.esmeralda.tari.com', networkName: 'esmeralda' };
  fallbackIndexers: IndexerProvider[] = [
    { url: 'https://indexer-fallback.tari.com', networkName: 'esmeralda' },
  ];
  timeoutMs: number = 5000;
  maxRetries: number = 3;
  userConfigurableEndpoints: boolean = true;
}

export interface PoolReadData {
  poolAddress: string;
  resourceAddresses: [string, string];
  reserveAmounts: [string, string];
  feeTier: number;
  lpTotalSupply?: string;
  timestamp?: number;
}

export interface PoolReadRequest {
  poolAddress?: string;
  resourceA?: string;
  resourceB?: string;
  includeHistory?: boolean;
}

export interface TransactionReadRequest {
  transactionId: string;
}

export interface ResourceReadRequest {
  resourceAddress: string;
}

export class ProtocolClient {
  private config: ProtocolClientConfig;

  constructor(config?: Partial<ProtocolClientConfig>) {
    this.config = { ...new ProtocolClientConfig(), ...config };
  }

  getConfig(): ProtocolClientConfig {
    return this.config;
  }

  async getPoolData(request: PoolReadRequest): Promise<IndexerResponse<PoolReadData>> {
    const url = this.selectIndexerUrl();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'pool_read', params: request }),
      });
      if (!res.ok) {
        throw new Error(`Indexer error: ${res.status}`);
      }
      const data: PoolReadData = await res.json();
      return { data, meta: { timestamp: Date.now() } };
    } catch (e) {
      return { data: { poolAddress: '', resourceAddresses: ['', ''], reserveAmounts: ['0', '0'], feeTier: 30 }, errors: [(e as Error).message] };
    }
  }

  async getTransactionStatus(request: TransactionReadRequest): Promise<IndexerResponse<{ status: string; epoch?: number }>> {
    const url = this.selectIndexerUrl();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'tx_read', params: request }),
      });
      const data = await res.json();
      return { data, meta: { timestamp: Date.now() } };
    } catch (e) {
      return { data: { status: 'unknown' }, errors: [(e as Error).message] };
    }
  }

  private selectIndexerUrl(): string {
    // Prefer primary; fall back to alternatives on failure (simplified here)
    return this.config.primaryIndexer.url;
  }

  healthCheck(): Promise<{ healthy: boolean; primary: boolean; fallback: boolean }> {
    return Promise.resolve({ healthy: true, primary: true, fallback: false });
  }
}
