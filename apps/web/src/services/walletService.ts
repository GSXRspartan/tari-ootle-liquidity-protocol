/**
 * Wallet/provider service.
 *
 * Implements the generic `WalletAdapter` seam on top of the single
 * `window.tari` boundary, and exposes the session model the React layer
 * consumes. Wallet brand never appears in trading logic: everything downstream
 * is capability-driven.
 *
 * Account / network / capability changes are pushed as events so the UI can
 * pause execution rather than continue under a silently changed identity.
 */

import type { WalletAdapter, WalletSession, NetworkInfo, AccountInfo, Balance, ResourceInfo, TransactionPreview, TransactionResult } from '@tari-ootle/wallet-adapter';
import type { PoolState, OotleReadbackProvider, AuthoritativeSubstateReader } from '@tari-ootle/protocol-client';
import { createOotleReadbackProvider, parsePoolState } from '@tari-ootle/protocol-client';
import type { WalletLegCapabilities } from '@tari-ootle/protocol-client/dist/crosschain/provider.js';
import {
  TariProviderError,
  disconnectProvider,
  fetchAccounts,
  fetchBalances,
  fetchCapabilities,
  fetchNetwork,
  fetchTransactionResult,
  getTariProvider,
  mapTransactionStatus,
  readSubstate,
  requestAccounts,
  signAndSubmit,
  type TariProvider,
} from './tariWindow.js';
import { checkNetwork } from '../lib/networks.js';

export type WalletEvent =
  | { kind: 'accountsChanged' }
  | { kind: 'networkChanged'; network: string }
  | { kind: 'capabilitiesChanged' }
  | { kind: 'disconnected' };

export type WalletEventListener = (event: WalletEvent) => void;

export interface WalletBridge extends WalletAdapter {
  /** The generic Tari provider capability advertisement, when advertised. */
  legCapabilities(): WalletLegCapabilities | undefined;
  /** Substate reader for the protocol-client's authoritative readback. */
  substateReader(): AuthoritativeSubstateReader;
  /** Ootle readback provider bound to this wallet. Never uses an indexer. */
  readbackProvider(): OotleReadbackProvider;
  on(listener: WalletEventListener): () => void;
}

function toNetworkInfo(view: { network: string; epoch?: string }, previous?: NetworkInfo): NetworkInfo {
  return {
    name: view.network,
    indexerUrls: previous?.indexerUrls ?? [],
    nativeResourceAddress: previous?.nativeResourceAddress ?? null,
  };
}

class TariBridgeWalletAdapter implements WalletBridge {
  private provider: TariProvider;
  private capabilities: WalletLegCapabilities | undefined;
  private session: WalletSession | undefined;
  private listeners = new Set<WalletEventListener>();
  private balances: Balance[] = [];
  private resources: ResourceInfo[] = [];

  constructor(private readonly allowedNetworkId: string) {
    this.provider = getTariProvider();
  }

  adapterName(): string {
    return 'TariBrowserProvider';
  }

  adapterType(): 'extension' {
    return 'extension';
  }

  async isSupported(): Promise<boolean> {
    try {
      this.provider = getTariProvider();
    } catch {
      return false;
    }
    try {
      // Mandatory capability handshake. A provider that cannot answer is not a
      // provider we will drive.
      this.capabilities = await fetchCapabilities(this.provider);
      return true;
    } catch {
      return false;
    }
  }

  async connect(networkHint?: NetworkInfo): Promise<WalletSession> {
    this.provider = getTariProvider();
    const network = await fetchNetwork(this.provider);
    const guard = checkNetwork(network.network);
    if (!guard.ok) {
      throw new TariProviderError(guard.reason ?? `Network "${network.network}" is not allowed.`, 'WRONG_NETWORK');
    }
    // The page is pinned to one network; a provider that silently reports a
    // different one is treated as an account/network change, not a mismatch to
    // paper over.
    if (network.network !== this.allowedNetworkId) {
      throw new TariProviderError(
        `This page is pinned to "${this.allowedNetworkId}" but the wallet reports "${network.network}". Switch the wallet network, then reconnect.`,
        'WRONG_NETWORK',
      );
    }
    const accounts = await requestAccounts(this.provider);
    if (accounts.length === 0) throw new TariProviderError('The wallet returned no account after an explicit connect request.', 'MALFORMED_REPLY');
    this.capabilities = await fetchCapabilities(this.provider);
    this.balances = await this.readBalances();

    const info: NetworkInfo = toNetworkInfo(network, networkHint);
    this.session = {
      adapterType: 'extension',
      connectedAt: new Date().toISOString(),
      network: info,
      account: { address: accounts[0].componentAddress, accountIndex: accounts[0].accountIndex ?? 0, label: 'Tari' },
      supportedFeatures: this.capabilities === undefined ? [] : Object.entries(this.capabilities).filter(([, v]) => v).map(([k]) => k),
      permissions: ['readBalances', 'signTransactions'],
    };
    this.listeners.forEach((listener) => listener({ kind: 'capabilitiesChanged' }));
    return this.session;
  }

  async disconnect(): Promise<void> {
    this.session = undefined;
    this.balances = [];
    this.resources = [];
    try {
      const provider = this.provider;
      await fetchAccounts(provider); // cheap liveness probe before revoking
      await disconnectProvider(provider);
    } catch {
      // A provider that refuses or has gone away is already disconnected.
    }
    this.listeners.forEach((listener) => listener({ kind: 'disconnected' }));
  }

  async getNetwork(): Promise<NetworkInfo> {
    const view = await fetchNetwork(this.provider);
    const guard = checkNetwork(view.network);
    if (!guard.ok) throw new TariProviderError(guard.reason ?? 'Disallowed network.', 'WRONG_NETWORK');
    return toNetworkInfo(view, this.session?.network);
  }

  async getAccounts(): Promise<AccountInfo[]> {
    const accounts = await fetchAccounts(this.provider);
    return accounts.map((account, index) => ({ address: account.componentAddress, accountIndex: account.accountIndex ?? index }));
  }

  async getSelectedAccount(): Promise<AccountInfo> {
    const [first] = await this.getAccounts();
    if (first === undefined) throw new TariProviderError('The wallet reported no accounts.', 'MALFORMED_REPLY');
    return first;
  }

  private async readBalances(): Promise<Balance[]> {
    const raw = await fetchBalances(this.provider);
    this.balances = raw.map((entry) => ({
      resourceAddress: entry.resourceAddress,
      amount: entry.amount,
      resourceType: entry.resourceType as Balance['resourceType'],
    }));
    this.resources = this.balances.map((balance) => ({ address: balance.resourceAddress, type: balance.resourceType }));
    return this.balances;
  }

  async getBalances(): Promise<Balance[]> {
    return this.readBalances();
  }

  async getResources(): Promise<ResourceInfo[]> {
    return this.resources;
  }

  async previewTransaction(preview: Partial<TransactionPreview>): Promise<TransactionPreview> {
    const full: TransactionPreview = {
      componentAddress: preview.componentAddress ?? '',
      method: preview.method ?? '',
      args: preview.args ?? [],
      resourcesInvolved: preview.resourcesInvolved ?? [],
      estimatedOutputs: preview.estimatedOutputs ?? [],
      fee: preview.fee ?? 0,
      maxEpoch: preview.maxEpoch ?? 0,
      privacyDisclosure: preview.privacyDisclosure ?? 'Pool reserves and amounts are revealed at the AMM boundary.',
      networkName: (await this.getNetwork()).name,
    };
    return { ...preview, ...full };
  }

  async signAndSubmit(preview: TransactionPreview): Promise<TransactionResult> {
    const result = await signAndSubmit(this.provider, { method: preview.method, args: preview.args, component: preview.componentAddress }, {
      assets: preview.resourcesInvolved,
      operation: preview.method ?? 'transaction',
      network: preview.networkName,
      poolOrDestination: preview.componentAddress ?? '',
    });
    return { transactionId: result.transactionId, epoch: result.epoch === undefined ? 0 : Number(result.epoch), status: 'pending' };
  }

  async getTransactionStatus(txId: string): Promise<{ status: string; epoch?: number; error?: string }> {
    const view = await fetchTransactionResult(this.provider, txId);
    const mapped = mapTransactionStatus(view);
    return { status: mapped, epoch: view.epoch === undefined ? undefined : Number(view.epoch), error: view.error };
  }

  legCapabilities(): WalletLegCapabilities | undefined {
    return this.capabilities;
  }

  substateReader(): AuthoritativeSubstateReader {
    const provider = this.provider;
    return {
      async readComponent(address: string) {
        const view = await readSubstate(provider, address);
        if (view === undefined) return undefined;
        return {
          address: view.address,
          templateName: view.templateName,
          substateVersion: view.substateVersion,
          producingTxHash: view.producingTxHash,
          epoch: view.epoch,
          fields: view.fields,
        };
      },
      async readResource(address: string) {
        const view = await readSubstate(provider, address);
        if (view === undefined) return undefined;
        return { address: view.address, templateName: view.templateName, epoch: view.epoch, fields: view.fields };
      },
    };
  }

  readbackProvider(): OotleReadbackProvider {
    // `WALLET_PROVIDER` is an authoritative read source in the protocol-client.
    // An indexer is never substituted here.
    return createOotleReadbackProvider(this.substateReader(), 'WALLET_PROVIDER');
  }

  async readPoolState(poolComponent: string): Promise<PoolState> {
    const reader = this.substateReader();
    const envelope = await reader.readComponent(poolComponent);
    if (envelope === undefined) throw new Error(`Component ${poolComponent} does not exist.`);
    return parsePoolState({ ...envelope, source: 'WALLET_PROVIDER' });
  }

  on(listener: WalletEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export interface WalletService {
  bridge(): WalletBridge | undefined;
  allowedNetworkId: string;
}

/**
 * Build the wallet service for the current page. Returns an object whose
 * `bridge()` is undefined when no provider is injected — a disconnected state,
 * never a fake connected session.
 */
export function createWalletService(allowedNetworkId: string): WalletService {
  let bridge: WalletBridge | undefined;
  if (typeof globalThis === 'object' && globalThis !== null && (globalThis as { tari?: unknown }).tari !== undefined) {
    try {
      bridge = new TariBridgeWalletAdapter(allowedNetworkId);
    } catch {
      bridge = undefined;
    }
  }
  return { bridge: () => bridge, allowedNetworkId };
}
