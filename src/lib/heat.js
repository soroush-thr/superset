// 5-stop heat ramp interpolation for BodyMap. See BUILD-PLAN.md section 7.3.
import { HEAT_RAMP } from './constants.js'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/** Interpolate the heat ramp in sRGB at t in [0, 1]. */
export function rampColor(t) {
  const clamped = Math.min(1, Math.max(0, t))
  let lo = HEAT_RAMP[0]
  let hi = HEAT_RAMP[HEAT_RAMP.length - 1]
  for (let i = 0; i < HEAT_RAMP.length - 1; i++) {
    if (clamped >= HEAT_RAMP[i].t && clamped <= HEAT_RAMP[i + 1].t) {
      lo = HEAT_RAMP[i]
      hi = HEAT_RAMP[i + 1]
      break
    }
  }
  const span = hi.t - lo.t
  const localT = span === 0 ? 0 : (clamped - lo.t) / span
  const [r1, g1, b1] = hexToRgb(lo.hex)
  const [r2, g2, b2] = hexToRgb(hi.hex)
  const r = Math.round(lerp(r1, r2, localT))
  const g = Math.round(lerp(g1, g2, localT))
  const b = Math.round(lerp(b1, b2, localT))
  return `rgb(${r}, ${g}, ${b})`
}

/** value/scaleMax -> a ramp colour, clamped. The function BodyMap calls
 *  per region. */
export function heatColor(value, scaleMax) {
  if (!scaleMax || scaleMax <= 0) return rampColor(0)
  return rampColor(value / scaleMax)
}
