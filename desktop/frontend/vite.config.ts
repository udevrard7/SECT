import { defineConfig } from 'vite'

// Vite config minimal pour le frontend Wails.
// En Phase A : pas de build réel (juste un index.html statique dans dist/).
// En Phase B : on ajoutera les bindings TypeScript générés par Wails.
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
