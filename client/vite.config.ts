import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 8050,
    proxy: {
      '/api': { target: 'http://localhost:8040', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          pdf: ['pdfjs-dist'],
          // Heavy deps were already tree-shaken out of the main entry (three/gsap/
          // framer-motion live only in unused unlumen components, so they aren't
          // bundled at all). Isolating the icon set improves caching and first
          // paint of the shared shell (ticket 127).
          icons: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
