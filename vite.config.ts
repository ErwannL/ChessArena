import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist/web', emptyOutDir: true, target: 'es2022' },
  worker: { format: 'es' },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
