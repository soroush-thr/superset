// Minimal line-chart geometry. Pure functions, no DOM -- same idea as
// bodyRegions.js: data-driven path builders, the component stays a thin
// render layer.

/** Map a value in `domain` [d0, d1] to `range` [r0, r1], linearly. */
export function scaleLinear(domain, range) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0))
}

/** "Nice" round tick values spanning [min, max], for axis labels. */
export function niceTicks(min, max, count = 4) {
  if (min === max) return [min]
  const rawStep = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const residual = rawStep / magnitude
  let step
  if (residual > 5) step = 10 * magnitude
  else if (residual > 2) step = 5 * magnitude
  else if (residual > 1) step = 2 * magnitude
  else step = magnitude

  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6)
  }
  return ticks
}

/** SVG path `d` for a polyline through `points` ({x, y}), mapped to pixel
 *  space by the given scales. */
export function linePath(points, xScale, yScale) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`)
    .join(' ')
}
