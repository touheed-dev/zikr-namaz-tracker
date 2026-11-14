import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD_ID = Date.now().toString(36);

// Stamp a unique build id into dist/sw.js so every deploy installs a new
// service worker (which then clears old caches and reloads open tabs once).
function stampServiceWorker(id) {
  let outDir = 'dist';
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir; },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      if (!existsSync(file)) return;
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD__', id));
    },
  };
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(BUILD_ID),
  },
  plugins: [react(), stampServiceWorker(BUILD_ID)],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
