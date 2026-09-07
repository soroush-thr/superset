import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages build. Relative base so it works from any repo path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', assetsInlineLimit: 0 },
})
