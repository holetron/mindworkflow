import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvedHost = process.env.VITE_HOST ?? '0.0.0.0';
const envPort = Number(process.env.VITE_PORT);
const resolvedPort = Number.isFinite(envPort) && envPort > 0 ? envPort : 5174;
// Default to localhost:6048 for dev, can override with VITE_API_TARGET
// But proxy will work on any host since we use changeOrigin: true
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:6048';
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const appVersion: string = packageJson.version ?? 'dev';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: resolvedHost,
    port: resolvedPort,
    allowedHosts: ['mindworkflow.com', 'www.mindworkflow.com', 'localhost', '127.0.0.1', '94.103.81.53'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
