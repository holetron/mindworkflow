import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvedHost = process.env.VITE_HOST ?? '0.0.0.0';
const envPort = Number(process.env.VITE_PORT);
const resolvedPort = Number.isFinite(envPort) && envPort > 0 ? envPort : 5173;
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:4321';

export default defineConfig({
  plugins: [react()],
  server: {
    host: resolvedHost,
    port: resolvedPort,
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
});
