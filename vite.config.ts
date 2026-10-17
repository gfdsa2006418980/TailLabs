import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs keep this experiment portable from its TL001 subdirectory.
  base: './',
  build: {
    outDir: 'dist/TL001',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/phaser/')) return 'phaser';
        },
      },
    },
  },
});
