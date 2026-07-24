import { defineConfig } from 'vite'

// Vite config minimal pour le frontend Wails.
// Phase B : index.html à la racine de frontend/ (point d'entrée Vite standard).
// Vite build génère frontend/dist/ qui est embarqué via go:embed dans main.go.
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
