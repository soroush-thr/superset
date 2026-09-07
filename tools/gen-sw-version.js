#!/usr/bin/env node
// Rewrites public/sw.js's CACHE_VERSION to a fresh value before every
// build. Run by both build scripts in package.json (Pages and standalone),
// so the two are never built with different versions.
//
// This exists because a service worker only updates when its own script's
// bytes change -- if sw.js is byte-identical to what's already installed
// in a visitor's browser, they never get the new cache, and a stale shell
// can end up referencing a hashed JS/CSS file a later deploy deleted
// (white screen, no way back except manually clearing site data). Using
// the git commit as the version means every real deploy is guaranteed to
// change these bytes.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SW_PATH = resolve(__dirname, '../public/sw.js')

function currentVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    // No git available (e.g. a source-only checkout) -- a timestamp still
    // guarantees the bytes differ from whatever was there before.
    return String(Date.now())
  }
}

const version = currentVersion()
const src = readFileSync(SW_PATH, 'utf8')

if (!src.includes('CACHE_VERSION')) {
  throw new Error(`${SW_PATH}: no CACHE_VERSION line found -- did the file structure change?`)
}

const next = src.replace(
  /const CACHE_VERSION = .*/,
  `const CACHE_VERSION = '${version}' // written by tools/gen-sw-version.js, do not hand-edit`,
)
writeFileSync(SW_PATH, next)
console.log(`sw.js CACHE_VERSION -> ${version}`)
