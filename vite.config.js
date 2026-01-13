import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.jsx',
      name: 'LEXScheduler',
      fileName: 'lex-scheduler',
      formats: ['iife'], // Immediately invoked function for embedding
    },
    rollupOptions: {
      output: {
        // Inline all dependencies into a single file
        inlineDynamicImports: true,
        // Ensure CSS is injected into the JS
        assetFileNames: 'lex-scheduler.[ext]',
      },
    },
    cssCodeSplit: false, // Include CSS in the JS bundle
    minify: 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
