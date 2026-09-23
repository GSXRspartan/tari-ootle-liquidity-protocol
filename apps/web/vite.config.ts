import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tari-ootle/wallet-adapter': resolve(__dirname, '../../packages/wallet-adapter/src/index'),
    },
  },
  base: process.env.BASE_PATH || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  define: {
    'process.env.BASE_PATH': JSON.stringify(process.env.BASE_PATH || '/'),
  },
});
