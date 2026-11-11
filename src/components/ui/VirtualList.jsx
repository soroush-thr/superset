import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

const OVERSCAN = 6

/**
 * A hand-rolled fixed-row-height windowed list -- no dependency, per
 * section 9.1 ("876 rows with images will jank on a phone otherwise").
 *
 * Window-scrolled: the list has its full height in the page flow and the
 * page's own scrollbar drives it, so there is never a second scroller. We
 * work out which rows are on screen from the list's position relative to
 * the viewport and render only those (plus overscan).
 */
export default function VirtualList({ items, rowHeight, renderRow }) {
  const containerRef = useRef(null)
  const [range, setRange] = useState({ start: 0, end: 30 })

  const total = items.length

  useLayoutEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = containerRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top // list top relative to viewport
      const viewport = window.innerHeight
      const first = Math.floor(Math.max(0, -top) / rowHeight)
      const last = Math.ceil(Math.max(0, viewport - top) / rowHeight)
      const start = Math.max(0, first - OVERSCAN)
      const end = Math.min(total, last + OVERSCAN)
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [total, rowHeight])

  // Filters change the list length; keep the window position sensible.
  useEffect(() => {
    if (range.start >= total && total > 0) window.scrollTo({ top: 0 })
  }, [total, range.start])

  const visibleItems = items.slice(range.start, range.end)

  return (
    <div
      ref={containerRef}
      className="sx-virtual-list"
      style={{ height: total * rowHeight, position: 'relative' }}
    >
      {visibleItems.map((item, i) => {
        const index = range.start + i
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
  )
}
