import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

// vite-plugin-singlefile's removeViteModuleLoader option only strips the
// bundle-loading helper function, not the `type="module"` attribute on the
// inlined <script> tag itself.
//
// The attribute is not just a formality here: singlefile inlines the whole
// bundle as a <script> INSIDE <head>, before <body> (and #root) exist.
// type="module" scripts defer execution until the document is parsed --
// same as it would after a normal module load -- which is the only reason
// `document.getElementById('root')` succeeds.
//
// Two things were tried and verified broken before this one:
//   1. Just deleting the attribute: turns it into a classic script that
//      runs immediately at its position in <head>, before #root exists
//      -> React error #299, target container not found.
//   2. `defer`: per spec, defer has no effect on inline scripts (only
//      external `src` scripts) -- same failure as (1).
// The fix that actually works: wrap the bundle in a DOMContentLoaded
// listener, so it runs at the right time regardless of the attribute or
// where the tag sits in the document.
//
// The real closing `</script>` is found by searching for the literal,
// unescaped 9-byte substring `</script>` -- React's own minified source
// contains a decoy ("<script><\/script>", used internally to reset
// innerHTML) but it's backslash-escaped there, so it never matches this
// search; only the tag's real close does.
function stripModuleAttr() {
  return {
    name: 'strip-module-attr',
    apply: 'build',
    closeBundle() {
      const outFile = path.resolve('dist-standalone/index.html')
      if (!fs.existsSync(outFile)) return
      const html = fs.readFileSync(outFile, 'utf8')

      const openTag = '<script type="module">'
      const openIdx = html.indexOf(openTag)
      if (openIdx === -1) return
      const contentStart = openIdx + openTag.length
      const closeIdx = html.indexOf('</script>', contentStart)
      if (closeIdx === -1) return

      const content = html.slice(contentStart, closeIdx)
      const wrapped =
        `<script>window.addEventListener('DOMContentLoaded',function(){${content}});</script>`
      const out = html.slice(0, openIdx) + wrapped + html.slice(closeIdx + '</script>'.length)
      fs.writeFileSync(outFile, out)
    },
  }
}

// file:// build. Everything (JS, CSS, exercise data) inlined into one HTML
// file as a classic script, because Chrome blocks module scripts and fetch()
// over file://.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), stripModuleAttr()],
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
