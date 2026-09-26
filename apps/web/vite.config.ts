import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const protocolClientSrc = resolve(__dirname, '../../packages/protocol-client/src');

/**
 * The complete set of build-time inputs the app is allowed to read. Anything not
 * listed here cannot influence the bundle, which keeps the mainnet / dev-provider
 * policy auditable in one place.
 */
function envBag(mode: string): Record<string, string | boolean | undefined> {
  return {
    MODE: mode,
    DEV: mode === 'development',
    VITE_TARI_NETWORK: process.env.VITE_TARI_NETWORK,
    VITE_INDEXER_URL: process.env.VITE_INDEXER_URL,
    VITE_ENABLE_DEV_PROVIDERS: process.env.VITE_ENABLE_DEV_PROVIDERS,
    VITE_WALLETD_URL: process.env.VITE_WALLETD_URL,
    VITE_USE_FIXTURE_DATA: process.env.VITE_USE_FIXTURE_DATA,
    TARI_LIQUIDITY_ENABLE_REAL_CROSSCHAIN_SUBMIT: process.env.TARI_LIQUIDITY_ENABLE_REAL_CROSSCHAIN_SUBMIT,
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // The existing convention: workspace packages are aliased to source so the
      // browser gets real ES modules. `packages/protocol-client` has no
      // `"type": "module"`, so its tsc output is CommonJS and cannot be bundled
      // for the browser.
      { find: '@tari-ootle/wallet-adapter', replacement: resolve(__dirname, '../../packages/wallet-adapter/src/index.ts') },
      // wallet-adapter imports protocol-client by deep `dist/*.js` path. Rewrite
      // those to source too, so there is exactly ONE copy of the protocol client
      // in the bundle (no duplicate module instances or divergent type values).
      { find: /^@tari-ootle\/protocol-client\/dist\/(.*)\.js$/, replacement: `${protocolClientSrc}/$1.ts` },
      { find: /^@tari-ootle\/protocol-client$/, replacement: `${protocolClientSrc}/index.ts` },
    ],
  },
  base: process.env.BASE_PATH || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['lightweight-charts'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  define: {
    'process.env.BASE_PATH': JSON.stringify(process.env.BASE_PATH || '/'),
    __OOTLE_ENV__: JSON.stringify(envBag(mode)),
  },
}));
