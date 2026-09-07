import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { reducer, initState, saveState, flushSave } from './lib/store.js'
import Library from './components/Library.jsx'
import RoutineBuilder from './components/RoutineBuilder.jsx'
import Coverage from './components/Coverage.jsx'
import Settings from './components/Settings.jsx'
import BodyMap from './components/BodyMap.jsx'

const StoreContext = createContext(null)

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

// The sticky right-column body map (section 8.4) is rendered by the shell,
// but its data comes from whichever screen is active (Routine or
// Coverage). This context is the seam: a screen calls useBodyMapFeed() to
// push { front, back, scaleMax, onRegionClick }, and the shell's <aside>
// just renders whatever was last pushed.
const BodyMapFeedContext = createContext(null)

const EMPTY_BODY_MAP_FEED = { front: {}, back: {}, scaleMax: undefined, onRegionClick: undefined }

/** Call from a screen with a live body map. Push new values whenever they
 *  change; the shell re-renders the aside from the latest push. */
export function useBodyMapFeed(feed) {
  const setFeed = useContext(BodyMapFeedContext)
  useEffect(() => {
    setFeed(feed)
    return () => setFeed(EMPTY_BODY_MAP_FEED)
  }, [feed, setFeed])
}

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const isFirstRender = useRef(true)

  // Write-through on every mutation (debounced inside saveState), section 5.2.
  // Skip the very first render so loading state doesn't immediately re-save it.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    saveState(state)
  }, [state])

  // Flush any pending debounced write before the tab closes.
  useEffect(() => {
    const onUnload = () => flushSave(state)
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [state])

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

// Four screens, in-app tab state -- no router library (decision 10).
// Screens that carry a live body map in their sticky right column
// (section 8.4): Routine and Coverage.
const SCREENS = [
  { id: 'library', label: 'Library', icon: '▤', Component: Library, hasBodyMap: false },
  { id: 'routine', label: 'Routine', icon: '☰', Component: RoutineBuilder, hasBodyMap: true },
  { id: 'coverage', label: 'Coverage', icon: '◉', Component: Coverage, hasBodyMap: true },
  { id: 'settings', label: 'Settings', icon: '⚙', Component: Settings, hasBodyMap: false },
]

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  )
}

function AppShell() {
  const [activeScreen, setActiveScreen] = useState('library')
  const [bodyMapFeed, setBodyMapFeed] = useState(EMPTY_BODY_MAP_FEED)
  const screen = SCREENS.find((s) => s.id === activeScreen)
  const { Component } = screen

  return (
    <div className="sx-app">
      <nav className="sx-rail" aria-label="Screens">
        <div className="sx-rail-brand">Superset</div>
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`sx-rail-item${s.id === activeScreen ? ' sx-active' : ''}`}
            aria-current={s.id === activeScreen ? 'page' : undefined}
            onClick={() => setActiveScreen(s.id)}
          >
            <span aria-hidden="true">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="sx-app-body">
        <div className="sx-layout">
          <main className="sx-main">
            <div className="sx-content">
              <BodyMapFeedContext.Provider value={setBodyMapFeed}>
                <Component />
              </BodyMapFeedContext.Provider>
            </div>
          </main>
          {screen.hasBodyMap && (
            <aside className="sx-side sx-side--active" aria-label="Body map">
              <BodyMap
                view="front"
                values={bodyMapFeed.front}
                scaleMax={bodyMapFeed.scaleMax}
                onRegionClick={bodyMapFeed.onRegionClick}
              />
              <BodyMap
                view="back"
                values={bodyMapFeed.back}
                scaleMax={bodyMapFeed.scaleMax}
                onRegionClick={bodyMapFeed.onRegionClick}
              />
            </aside>
          )}
        </div>

        <nav className="sx-bottom-bar" aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sx-bottom-item${s.id === activeScreen ? ' sx-active' : ''}`}
              aria-current={s.id === activeScreen ? 'page' : undefined}
              onClick={() => setActiveScreen(s.id)}
            >
              <span aria-hidden="true">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
