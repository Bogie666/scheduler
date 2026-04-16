import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build config for the embeddable MEMBERS widget bundle.
// Emits: dist/lex-members-scheduler.iife.js + dist/lex-members-scheduler.css
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/members-index.jsx',
      name: 'LEXMembersScheduler',
      fileName: () => 'lex-members-scheduler.iife.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: 'lex-members-scheduler.[ext]',
      },
    },
    minify: 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
