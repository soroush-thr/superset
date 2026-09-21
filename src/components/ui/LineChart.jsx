import React from 'react'
import { scaleLinear, linePath, niceTicks } from '../../lib/chart.js'

const PADDING = { top: 12, right: 12, bottom: 8, left: 40 }
const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)']

/**
 * A minimal multi-series line chart. `series` is
 * [{ label, points: [{x, y}], color? }], x is a timestamp in ms, y numeric.
 * No axis library, no animation -- same "data-driven SVG, thin component"
 * approach as BodyMap.
 */
export default function LineChart({ series, width = 560, height = 200, yLabel }) {
  const allPoints = series.flatMap((s) => s.points)
  const xs = allPoints.map((p) => p.x)
  const ys = allPoints.map((p) => p.y)

  const innerWidth = width - PADDING.left - PADDING.right
  const innerHeight = height - PADDING.top - PADDING.bottom

  const xDomain = xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1]
  const yMax = ys.length ? Math.max(...ys) : 1
  const yDomain = [0, yMax || 1]

  const xScale = scaleLinear(xDomain, [PADDING.left, PADDING.left + innerWidth])
  const yScale = scaleLinear(yDomain, [PADDING.top + innerHeight, PADDING.top])

  if (allPoints.length === 0) {
    return <p className="sx-empty-state">Not enough data yet.</p>
  }

  const yTicks = niceTicks(yDomain[0], yDomain[1], 4)

  return (
    <div>
      <svg className="sx-linechart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={yLabel}>
        {yTicks.map((t) => (
          <g key={t}>
            <line
              className="sx-linechart-gridline"
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={yScale(t)}
              y2={yScale(t)}
            />
            <text
              className="sx-linechart-tick"
              x={PADDING.left - 6}
              y={yScale(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {t}
            </text>
          </g>
        ))}

        {series.map((s, i) => (
          <path
            key={s.label}
            className="sx-linechart-line"
            d={linePath(s.points, xScale, yScale)}
            stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            fill="none"
          />
        ))}

        {series.map((s, i) =>
          s.points.map((p) => (
            <circle
              key={`${s.label}-${p.x}`}
              className="sx-linechart-point"
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={3}
              fill={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            />
          )),
        )}
      </svg>

      <div className="sx-linechart-legend">
        {series.map((s, i) => (
          <span key={s.label} className="sx-linechart-legend-item">
            <span
              className="sx-linechart-legend-dot"
              style={{ background: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
