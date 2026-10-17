import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs support both root and repository GitHub Pages sites.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/phaser/')) return 'phaser';
        },
      },
    },
  },
});
