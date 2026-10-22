import { defineConfig } from 'vite';

export default defineConfig({
  root: 'TL004',
  base: './',
  server: { host: '0.0.0.0', port: 5176, strictPort: true },
  preview: { host: '0.0.0.0', port: 4176, strictPort: true },
  build: {
    outDir: '../dist/TL004',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) { if (id.includes('/node_modules/phaser/')) return 'phaser'; },
      },
    },
  },
});
