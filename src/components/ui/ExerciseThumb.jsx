import React, { useState } from 'react'
import { IMG_BASE } from '../../lib/constants.js'

/**
 * An exercise's picture. The dataset has two frames per exercise (start and
 * end position); when both exist they crossfade back and forth so the image
 * shows the movement. `size` is 'sm' | 'md' | 'lg'. Pass `onClick` to make
 * it a button (e.g. to open the full instructions). Falls back to a blank
 * tile if there is no image or it fails to load (offline, custom exercise).
 */
export default function ExerciseThumb({ exercise, size = 'md', onClick }) {
  const [failed, setFailed] = useState(false)
  const frames = (exercise?.images ?? []).slice(0, 2)
  const label = exercise ? `${exercise.name}: show instructions` : undefined

  const body =
    frames.length === 0 || failed ? (
      <span className="sx-thumb-blank" aria-hidden="true" />
    ) : (
      frames.map((src, i) => (
        <img
          key={src}
          src={`${IMG_BASE}${src}`}
          alt=""
          loading="lazy"
          className={i === 1 ? 'sx-thumb-frame-2' : undefined}
          onError={() => setFailed(true)}
        />
      ))
    )

  const className = `sx-thumb sx-thumb-${size}${frames.length > 1 ? ' sx-thumb-animated' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={label}>
        {body}
      </button>
    )
  }
  return <span className={className}>{body}</span>
}
