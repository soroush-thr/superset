// Renders a session summary as a shareable PNG. The picture is built as an
// SVG string (the same body-map paths the app draws), rasterised through an
// <img> onto a canvas. No network, no extra library, and it works from the
// file:// standalone build because the SVG is passed as a data: URL.
import { SILHOUETTE_D, FRONT_REGIONS, BACK_REGIONS, FRONT_DETAILS, BACK_DETAILS } from './bodyRegions.js'
import { heatColor } from './heat.js'

const W = 1080
const H = 1350

// A canvas cannot read CSS custom properties, so these mirror the tokens in
// styles.css (section 8.2). Keep them in step.
const C = {
  bg: '#09090a',
  surface: '#17171a',
  line: '#2a2a30',
  text: '#f2f2f3',
  dim: '#a8a8b0',
  faint: '#8a8a93',
  record: '#c9a24b',
}
const SANS = "Geist, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO = "'Geist Mono', 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch])

const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

function figure(regions, details, totals, scaleMax, x, y, scale) {
  const paths = regions
    .map((r) => {
      const fill = heatColor(totals[r.id] || 0, scaleMax)
      const one = (d) => `<path d="${d}" fill="${fill}" stroke="${C.bg}" stroke-width="1.4" stroke-linejoin="round"/>`
      return one(r.d) + (r.mirror ? one(r.dMirror) : '')
    })
    .join('')
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})">` +
    `<path d="${SILHOUETTE_D}" fill="${C.surface}" stroke="${C.line}" stroke-width="1.5"/>` +
    paths +
    `<path d="${details}" fill="none" stroke="${C.bg}" stroke-width="1.1" stroke-linecap="round" stroke-opacity="0.75"/>` +
    `</g>`
  )
}

/**
 * The summary as an SVG document string.
 *  title, dateLabel: strings
 *  stats: [{ value, label }] (three read best)
 *  regionTotals, scaleMax: body-map heat, keyed by region id
 *  records: [string] lines, already formatted
 */
export function summarySvg({ title, dateLabel, stats, regionTotals, scaleMax, records }) {
  const colW = (W - 160) / stats.length
  const statCells = stats
    .map((s, i) => {
      const x = 80 + i * colW
      return (
        `<text x="${x}" y="372" font-family="${MONO}" font-size="68" font-weight="500" fill="${C.text}">${esc(s.value)}</text>` +
        `<text x="${x}" y="416" font-family="${MONO}" font-size="24" letter-spacing="3" fill="${C.faint}">${esc(s.label.toUpperCase())}</text>`
      )
    })
    .join('')

  const shown = records.slice(0, 3)
  const more = records.length - shown.length
  const recordLines = shown
    .map(
      (line, i) =>
        `<circle cx="92" cy="${1182 + i * 46}" r="7" fill="${C.record}"/>` +
        `<text x="116" y="${1192 + i * 46}" font-family="${SANS}" font-size="30" fill="${C.text}">${esc(clip(line, 54))}</text>`,
    )
    .join('')
  const recordBlock =
    records.length === 0
      ? ''
      : `<text x="80" y="1136" font-family="${MONO}" font-size="24" letter-spacing="3" fill="${C.record}">` +
        `${records.length} PERSONAL RECORD${records.length === 1 ? '' : 'S'}${more > 0 ? ` · TOP ${shown.length} SHOWN` : ''}</text>${recordLines}`

  const s = 1
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${C.bg}"/>` +
    `<text x="80" y="112" font-family="${MONO}" font-size="24" letter-spacing="5" fill="${C.faint}">SUPERSET · ${esc(dateLabel.toUpperCase())}</text>` +
    `<text x="80" y="206" font-family="${SANS}" font-size="68" font-weight="600" letter-spacing="-1.4" fill="${C.text}">${esc(clip(title, 26))}</text>` +
    `<line x1="80" y1="258" x2="${W - 80}" y2="258" stroke="${C.line}" stroke-width="2"/>` +
    statCells +
    figure(FRONT_REGIONS, FRONT_DETAILS, regionTotals, scaleMax, 250, 450, s) +
    figure(BACK_REGIONS, BACK_DETAILS, regionTotals, scaleMax, 570, 450, s) +
    recordBlock +
    `</svg>`
  )
}

/** Rasterise an SVG string to a PNG Blob. */
export function svgToPngBlob(svg, width = W, height = H) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/png')
    }
    img.onerror = () => reject(new Error('Could not render image'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/**
 * Hand the PNG to the system share sheet where it accepts files (phones),
 * otherwise download it. Resolves to 'shared' | 'saved' | 'cancelled'.
 */
export async function shareOrSavePng(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // Any other failure (permission, unsupported target): fall through.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}
