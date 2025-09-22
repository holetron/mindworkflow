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
      },
    },
  },
});
