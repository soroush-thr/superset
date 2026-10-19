// SVG path-string helpers for BodyMap. Pure functions, no React. Shapes are
// authored as point lists and turned into smooth closed curves, so mirrored
// copies come from reflecting the points across the centerline (arithmetic,
// never an SVG transform) -- see BUILD-PLAN.md section 7.2.

export const VIEW_WIDTH = 260

/** Reflect an x-coordinate across the view's vertical centerline. */
export function mirrorX(x) {
  return VIEW_WIDTH - x
}

/** Reflect a point list across the centerline. */
export function mirrorPoints(points) {
  return points.map(([x, y]) => [mirrorX(x), y])
}

const fmt = (n) => Math.round(n * 10) / 10

/**
 * A smooth closed curve through every point (Catmull-Rom converted to cubic
 * Beziers). `tension` 1 is the standard spline; lower values pull the curve
 * tighter to the polygon, which keeps small muscles from bulging.
 */
export function smoothClosed(points, tension = 1) {
  const n = points.length
  const k = tension / 6
  let d = `M${fmt(points[0][0])},${fmt(points[0][1])} `
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) * k
    const c1y = p1[1] + (p2[1] - p0[1]) * k
    const c2x = p2[0] - (p3[0] - p1[0]) * k
    const c2y = p2[1] - (p3[1] - p1[1]) * k
    d += `C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2[0])},${fmt(p2[1])} `
  }
  return d + 'Z'
}

/** A smooth open curve through the points (for decorative detail lines). */
export function smoothOpen(points, tension = 1) {
  const n = points.length
  const k = tension / 6
  let d = `M${fmt(points[0][0])},${fmt(points[0][1])} `
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, n - 1)]
    const c1x = p1[0] + (p2[0] - p0[0]) * k
    const c1y = p1[1] + (p2[1] - p0[1]) * k
    const c2x = p2[0] - (p3[0] - p1[0]) * k
    const c2y = p2[1] - (p3[1] - p1[1]) * k
    d += `C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2[0])},${fmt(p2[1])} `
  }
  return d.trim()
}

/**
 * A left-right symmetric outline from its right half: points run from the
 * top of the centerline, down the right side, to the bottom of the
 * centerline. The left half is the mirrored list walked back up.
 */
export function symmetric(rightHalf) {
  const left = mirrorPoints(rightHalf.slice(1, -1)).reverse()
  return [...rightHalf, ...left]
}

/** A full ellipse as a path "d" string. */
export function ellipse(cx, cy, rx, ry) {
  return (
    `M${cx - rx},${cy} ` +
    `A${rx},${ry} 0 1 0 ${cx + rx},${cy} ` +
    `A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`
  )
}
