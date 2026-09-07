// SVG path-string helpers for BodyMap. Pure functions, no React. Everything
// here produces plain "d" attribute strings so shapes can be mirrored by
// arithmetic (reflecting x across the centerline) instead of an SVG
// transform -- see BUILD-PLAN.md section 7.2.

export const VIEW_WIDTH = 260
const CENTER_X = VIEW_WIDTH / 2

/** Reflect an x-coordinate across the view's vertical centerline. */
export function mirrorX(x) {
  return VIEW_WIDTH - x
}

/**
 * A rounded rectangle as a path "d" string. r is clamped to half the
 * shorter side, so passing r = min(w,h)/2 yields a capsule/pill shape and
 * r = w/2 = h/2 on a square yields a circle -- one helper covers rects,
 * capsules, and circles/ellipsoids-by-rect.
 */
export function roundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  return (
    `M${x + rr},${y} ` +
    `H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} ` +
    `V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} ` +
    `H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} ` +
    `V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`
  )
}

/** Mirror a roundedRect defined by its (x, y, w, h, r) across the centerline. */
export function mirrorRoundedRect(x, y, w, h, r) {
  return roundedRect(mirrorX(x + w), y, w, h, r)
}

/** A full ellipse as a path "d" string. */
export function ellipse(cx, cy, rx, ry) {
  return (
    `M${cx - rx},${cy} ` +
    `A${rx},${ry} 0 1 0 ${cx + rx},${cy} ` +
    `A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`
  )
}

/** Mirror an ellipse defined by its center across the centerline. */
export function mirrorEllipse(cx, cy, rx, ry) {
  return ellipse(mirrorX(cx), cy, rx, ry)
}

/** A simple quadrilateral (e.g. the torso trapezoid), given four corners
 *  going clockwise from top-left. No rounding -- this sits underneath the
 *  region shapes, which carry the "rounded joins" look themselves. */
export function quad(x1, y1, x2, y2, x3, y3, x4, y4) {
  return `M${x1},${y1} L${x2},${y2} L${x3},${y3} L${x4},${y4} Z`
}
