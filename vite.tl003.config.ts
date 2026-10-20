import { defineConfig } from 'vite';

export default defineConfig({
  root: 'TL003', base: './',
  server: { host: '0.0.0.0', port: 5175, strictPort: true },
  preview: { host: '0.0.0.0', port: 4175, strictPort: true },
  build: { outDir: '../dist/TL003', emptyOutDir: true },
});
