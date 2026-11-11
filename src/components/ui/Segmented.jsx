import React, { useLayoutEffect, useRef, useState } from 'react'

/**
 * A segmented control -- e.g. the Home/Gym/All equipment profile switch
 * (section 9.1) or the peak/fraction credit mode toggle (section 9.4).
 * `options` is [{ value, label }]; `value`/`onChange` are the selected value.
 *
 * A single absolutely-positioned thumb slides under the active option. It is
 * measured from the active button (offsetLeft/Top/Width/Height), so it also
 * follows the control when the options wrap onto a second row.
 */
export default function Segmented({ options, value, onChange }) {
  const trackRef = useRef(null)
  const [thumb, setThumb] = useState(null)
  // Skip the slide on the first measurement so the thumb doesn't fly in from 0,0.
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return undefined
    const measure = () => {
      const active = track.querySelector('.sx-active')
      if (!active) {
        setThumb(null)
        return
      }
      setThumb({
        x: active.offsetLeft,
        y: active.offsetTop,
        w: active.offsetWidth,
        h: active.offsetHeight,
      })
    }
    measure()
    setReady(true)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    return () => ro.disconnect()
  }, [value, options])

  return (
    <div className="sx-segmented" role="radiogroup" ref={trackRef}>
      {thumb && (
        <span
          className={`sx-segmented-thumb${ready ? ' sx-segmented-thumb--ready' : ''}`}
          aria-hidden="true"
          style={{
            width: thumb.w,
            height: thumb.h,
            transform: `translate(${thumb.x}px, ${thumb.y}px)`,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={`sx-segmented-item${opt.value === value ? ' sx-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
