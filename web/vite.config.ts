import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
  },
});
