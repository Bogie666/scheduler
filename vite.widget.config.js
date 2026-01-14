import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build config for embeddable widget bundle
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.jsx',
      name: 'LEXScheduler',
      fileName: () => 'lex-scheduler.iife.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: 'lex-scheduler.[ext]',
      },
    },
    minify: 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
