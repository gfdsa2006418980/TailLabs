import { defineConfig } from 'vite';

export default defineConfig({
  root: 'TL002',
  base: './',
  server: { host: '0.0.0.0', port: 5174, strictPort: true },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true },
  build: {
    outDir: '../dist/TL002',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) { if (id.includes('/node_modules/phaser/')) return 'phaser'; },
      },
    },
  },
});
