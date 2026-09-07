// Region layout for BodyMap: where each of the 30 taxonomy regions (section
// 7.1) sits on a 260x620 stylized front/back silhouette. Data-driven so the
// SVG itself stays a thin render of this table -- see BUILD-PLAN.md
// section 7.2.
import { roundedRect, mirrorRoundedRect, ellipse, mirrorEllipse, quad } from './bodyShapes.js'

export const VIEW_BOX = '0 0 260 620'

// ------------------------------------------------------------- silhouette
// One shared silhouette (front and back use the identical outline, per
// section 7.2). Built from body-part primitives concatenated into a single
// path's `d` (multiple M..Z subpaths render as one shape under the default
// nonzero fill rule).
function silhouetteD() {
  const head = ellipse(130, 34, 26, 28)
  const neck = roundedRect(110, 54, 40, 28, 10)
  const torso = quad(72, 82, 188, 82, 176, 288, 84, 288)
  const armR = roundedRect(194, 84, 34, 190, 17)
  const armL = mirrorRoundedRect(194, 84, 34, 190, 17)
  const handR = ellipse(211, 284, 20, 24)
  const handL = mirrorEllipse(211, 284, 20, 24)
  const legR = roundedRect(134, 280, 46, 280, 23)
  const legL = mirrorRoundedRect(134, 280, 46, 280, 23)
  const footR = roundedRect(130, 552, 58, 24, 10)
  const footL = mirrorRoundedRect(130, 552, 58, 24, 10)
  return [head, neck, torso, armR, armL, handR, handL, legR, legL, footR, footL].join(' ')
}

export const SILHOUETTE_D = silhouetteD()

// ---------------------------------------------------------------- regions
// Each entry is built via a shape descriptor so the mirrored copy (for
// bilateral regions) is computed arithmetically from the exact same
// parameters, never by re-parsing an SVG path string. `mirror: true` means
// BodyMap renders both `d` and `dMirror` as sibling <path> elements sharing
// one data-region (section 7.2); `mirror: false` (midline shapes -- neck,
// abs, erector, traps) means only `d` is rendered.

function rect(id, x, y, w, h, r, mirror) {
  return {
    id,
    mirror,
    d: roundedRect(x, y, w, h, r),
    dMirror: mirror ? mirrorRoundedRect(x, y, w, h, r) : null,
  }
}

function oval(id, cx, cy, rx, ry, mirror) {
  return {
    id,
    mirror,
    d: ellipse(cx, cy, rx, ry),
    dMirror: mirror ? mirrorEllipse(cx, cy, rx, ry) : null,
  }
}

export const FRONT_REGIONS = [
  rect('neck', 110, 54, 40, 28, 10, false),
  oval('delt_ant', 178, 92, 20, 18, true),
  oval('delt_lat', 206, 100, 17, 21, true),
  rect('pec_upper', 140, 88, 48, 28, 13, true),
  rect('pec_mid', 140, 116, 46, 32, 14, true),
  rect('pec_lower', 138, 148, 42, 26, 12, true),
  rect('serratus', 172, 172, 24, 30, 10, true),
  rect('bicep', 198, 110, 26, 68, 13, true),
  rect('brachialis', 196, 178, 22, 32, 11, true),
  rect('forearm', 194, 212, 28, 68, 14, true),
  rect('abs_upper', 112, 172, 36, 38, 10, false),
  rect('abs_lower', 114, 212, 32, 38, 10, false),
  rect('oblique', 150, 186, 22, 58, 10, true),
  rect('hip_flexor', 140, 270, 24, 22, 8, true),
  rect('quad', 136, 296, 40, 148, 20, true),
  rect('adductor', 131, 300, 18, 108, 9, true),
  rect('tibialis', 140, 460, 24, 88, 12, true),
  rect('calf', 160, 462, 16, 78, 8, true),
]

export const BACK_REGIONS = [
  rect('neck', 110, 54, 40, 28, 10, false),
  rect('trap_upper', 95, 80, 70, 28, 13, false),
  rect('trap_mid', 100, 108, 60, 40, 14, false),
  rect('trap_lower', 112, 148, 36, 40, 12, false),
  oval('delt_post', 192, 98, 20, 18, true),
  oval('cuff', 175, 118, 13, 15, true),
  rect('rhomboid', 140, 116, 26, 34, 10, true),
  rect('teres', 164, 140, 20, 24, 8, true),
  rect('lat', 150, 156, 38, 68, 16, true),
  rect('erector', 118, 190, 24, 88, 10, false),
  rect('tricep', 198, 110, 26, 88, 13, true),
  rect('forearm', 194, 212, 28, 68, 14, true),
  rect('glute', 136, 270, 44, 50, 20, true),
  rect('ham', 138, 320, 38, 128, 19, true),
  rect('calf', 136, 460, 40, 88, 20, true),
]
