import React, { useRef, useState } from 'react'

const OVERSCAN = 6

/**
 * A hand-rolled fixed-row-height windowed list -- no dependency, per
 * section 9.1 ("876 rows with images will jank on a phone otherwise").
 * Renders only the rows in view (plus overscan) inside a spacer sized to
 * the full list, so scrollbar behaviour stays correct.
 */
export default function VirtualList({ items, rowHeight, height, renderRow }) {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)

  const total = items.length
  const visibleRows = Math.ceil(height / rowHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const endIndex = Math.min(total, startIndex + visibleRows + OVERSCAN * 2)
  const visibleItems = items.slice(startIndex, endIndex)

  return (
    <div
      ref={containerRef}
      className="sx-virtual-list"
      style={{ height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: total * rowHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
