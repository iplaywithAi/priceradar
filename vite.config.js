import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientDir = fileURLToPath(new URL('./client', import.meta.url));
const apiTarget = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  plugins: [react()],
  root: clientDir,
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: Number(process.env.CLIENT_PORT || 5173),
    proxy: {
      // The Express API runs separately in development. Vite forwards /api calls to it.
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
});
