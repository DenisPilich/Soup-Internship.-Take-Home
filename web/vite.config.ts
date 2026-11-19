import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Only /api is proxied. The ingestion path /runs/{id}/metrics is called by
    // experiment clients, not by the browser, so it does not need a proxy and
    // /runs/{id} can stay a client-side route.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
