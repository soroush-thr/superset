import React, { useState } from 'react'
import { IMG_BASE } from '../../lib/constants.js'
import MuscleFigure from './MuscleFigure.jsx'

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

  // With no picture, show which muscles the exercise works (more useful than
  // a letter); the monogram stays only for exercises with no muscle data.
  const hasMuscles = !!exercise?.sub && Object.keys(exercise.sub).length > 0

  const body =
    frames.length === 0 || failed ? (
      hasMuscles ? (
        <span className="sx-thumb-blank sx-thumb-blank--figure">
          <MuscleFigure values={exercise.sub} views="auto" label={`${exercise.name}: muscles worked`} />
        </span>
      ) : (
        <span className="sx-thumb-blank" aria-hidden="true">
          {(exercise?.name ?? '?').charAt(0).toUpperCase()}
        </span>
      )
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
