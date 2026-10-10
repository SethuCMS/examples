import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server settings.
 *
 * Two ways to reach the gateway from the browser:
 *  1. Direct (default): type the gateway address in the settings bar. The
 *     gateway must list http://localhost:5173 in SETHUCMS_ALLOWED_ORIGINS.
 *  2. Through this dev server: type /api as the gateway address. Vite forwards
 *     /api/* to the gateway, so the browser sees one origin and CORS is not
 *     involved. Point it at your gateway with GATEWAY_URL (default
 *     http://127.0.0.1:8080).
 */
const target = process.env['GATEWAY_URL'] ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The SDK is a file: dependency that lives outside this folder.
    fs: { allow: ['../..'] },
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
