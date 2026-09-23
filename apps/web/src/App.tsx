import { useState } from 'react';
import { BrowserExtensionWalletAdapter } from '@tari-ootle/wallet-adapter';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [adapterType, setAdapterType] = useState('none');

  const handleConnect = async () => {
    const adapter = new BrowserExtensionWalletAdapter();
    try {
      const supported = await adapter.isSupported();
      if (!supported) {
        alert('Browser extension wallet not detected. Please install the Tari Ootle wallet extension or use walletd in development mode.');
        return;
      }
      const session = await adapter.connect();
      setConnected(true);
      setAdapterType(session.adapterType);
    } catch (e) {
      console.error('Connection failed:', e);
      alert('Wallet connection failed: ' + (e as Error).message);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '2rem' }}>
      <header>
        <h1>Tari Ootle Liquidity Protocol</h1>
        <p>A permissionless, non-custodial liquidity protocol for Tari Ootle.</p>
      </header>

      <section style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Wallet Connection</h2>
        <p>Status: {connected ? `Connected (${adapterType})` : 'Not connected'}</p>
        <button onClick={handleConnect} disabled={connected} style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}>
          {connected ? 'Connected' : 'Connect Wallet'}
        </button>
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          Primary target: Browser Extension Signer. Mobile and walletd supported as alternatives.
        </p>
      </section>

      <section style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Protocol Status</h2>
        <ul>
          <li>P0 (Public Fungible / Tari): <strong>Experimental</strong> — math verified; pool deployment required.</li>
          <li>P1 (Fungible / Fungible): <strong>Experimental</strong></li>
          <li>P2 (Stealth / Tari): <strong>Blocked</strong> — privacy disclosure at AMM boundary required.</li>
          <li>P3 (Stablecoin): <strong>Blocked</strong> — upstream admin controls must be excluded.</li>
          <li>P4 (NFT Liquidity): <strong>Blocked</strong> — separate non-fungible design needed.</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Route Capability Matrix</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Route</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Public Fungible / Tari</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Experimental</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Requires deployment and indexer.</td></tr>
            <tr><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Public Fungible / Public Fungible</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Experimental</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Standard AMM route.</td></tr>
            <tr><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Stealth / Tari</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Blocked</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Privacy loss at boundary.</td></tr>
            <tr><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>NFT / Tari</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Blocked</td><td style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}>Requires separate NFT pool.</td></tr>
          </tbody>
        </table>
      </section>

      <footer style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #ccc', fontSize: '0.8rem', color: '#888' }}>
        <p>Non-custodial protocol. 0.30% fee (30 basis points) — 100% to liquidity providers. No developer fee.</p>
        <p>Built for Tari Ootle. Not audited for mainnet. See docs/AUDIT_CHECKLIST.md.</p>
      </footer>
    </div>
  );
}
