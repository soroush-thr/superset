import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// file:// build. Everything (JS, CSS, exercise data) inlined into one HTML
// file as a classic script, because Chrome blocks module scripts and fetch()
// over file://.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
