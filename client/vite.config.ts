import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Absolute origin (+ base path, no trailing slash) used for link-preview tags, e.g. https://user.github.io/repo
const publicUrl = (process.env.VITE_PUBLIC_URL ?? '').replace(/\/$/, '');

export default defineConfig({
  root: here,
  // Set VITE_BASE=/repo-name/ for GitHub Pages; defaults to '/' for the Node server.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), { name: 'public-url', transformIndexHtml: (html) => (publicUrl ? html.replaceAll('__PUBLIC_URL__', publicUrl) : html) }],
  resolve: { alias: { '@shared': path.resolve(here, '../shared') } },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/photos': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(here, '../dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
