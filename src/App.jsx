import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { historyReducer, initHistoryState, saveState, flushSave } from './lib/store.js'
import { buildExerciseIndex } from './lib/exercises.js'
import { decodeRoutine } from './lib/share.js'
import Library from './components/Library.jsx'
import RoutineBuilder from './components/RoutineBuilder.jsx'
import Train from './components/Train.jsx'
import Coverage from './components/Coverage.jsx'
import Settings from './components/Settings.jsx'
import BodyMap from './components/BodyMap.jsx'
import Drawer from './components/ui/Drawer.jsx'
import Onboarding from './components/Onboarding.jsx'

// State and dispatch are split into two contexts so a component that only
// needs to dispatch (write-heavy session logging) doesn't re-render on every
// state change -- dispatch's identity is stable, state's is not.
const StateContext = createContext(null)
const DispatchContext = createContext(null)

export function useStore() {
  const state = useContext(StateContext)
  const dispatch = useContext(DispatchContext)
  if (!state || !dispatch) throw new Error('useStore must be used within StoreProvider')
  return { state, dispatch }
}

export function useDispatch() {
  const dispatch = useContext(DispatchContext)
  if (!dispatch) throw new Error('useDispatch must be used within StoreProvider')
  return dispatch
}

/** The merged built-in + custom exercise registry, memoised on identity. */
export function useExercises() {
  const { state } = useStore()
  return useMemo(() => buildExerciseIndex(state.customExercises), [state.customExercises])
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
  // historyReducer wraps the plain reducer with undo/redo over the routines
  // slice only (see store.js) -- `state` here is historyState.present, the
  // only part that ever gets persisted; the past/future stacks are memory-only.
  const [historyState, dispatch] = useReducer(historyReducer, undefined, initHistoryState)
  const state = historyState.present
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

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

// Screens, in-app tab state -- no router library (decision 10). Screens
// that carry a live body map in their sticky right column (section 8.4):
// Routine, Train, and Coverage.
const SCREENS = [
  { id: 'library', label: 'Library', icon: '▤', Component: Library, hasBodyMap: false },
  { id: 'routine', label: 'Routine', icon: '☰', Component: RoutineBuilder, hasBodyMap: true },
  { id: 'train', label: 'Train', icon: '▶', Component: Train, hasBodyMap: true },
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

// A routine shared via URL (section 3.5) arrives in location.hash as
// `#share=<0|1>.<encoded>` -- 0/1 marks whether it's compressed. Decoded
// once on mount; the hash is stripped immediately either way so it doesn't
// re-trigger on the next reload. The decoded object is untrusted (it came
// from a URL someone else sent), so it's only ever shown back to the user
// for confirmation -- never dispatched until they explicitly import it, and
// the reducer rebuilds it field-by-field rather than trusting its shape.
function ShareImportPrompt({ onImported }) {
  const dispatch = useDispatch()
  const [incoming, setIncoming] = useState(null)

  useEffect(() => {
    const match = /^#share=([01])\.(.+)$/.exec(location.hash)
    if (!match) return
    const [, compressedFlag, encoded] = match
    decodeRoutine(encoded, compressedFlag === '1')
      .then((routine) => {
        if (routine && typeof routine.name === 'string' && Array.isArray(routine.days)) {
          setIncoming(routine)
        }
      })
      .catch((err) => console.error('Failed to decode shared routine link:', err))
      .finally(() => history.replaceState(null, '', location.pathname + location.search))
  }, [])

  if (!incoming) return null

  const dayCount = incoming.days.length
  const exerciseCount = incoming.days.reduce(
    (sum, d) => sum + (d.slots || []).reduce((s, slot) => s + (slot.entries || []).length, 0),
    0,
  )

  return (
    <Drawer open title="Import shared routine" onClose={() => setIncoming(null)}>
      <p>
        Someone shared the routine <strong>{incoming.name}</strong> with you -- {dayCount} day
        {dayCount === 1 ? '' : 's'}, {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}.
      </p>
      <p className="sx-helper-text">
        This adds it as a new routine. It won't change or overwrite anything you already have.
      </p>
      <button
        type="button"
        className="sx-primary"
        onClick={() => {
          dispatch({ type: 'IMPORT_SHARED_ROUTINE', routine: incoming })
          setIncoming(null)
          onImported?.()
        }}
      >
        Import
      </button>
      <button type="button" onClick={() => setIncoming(null)}>
        Dismiss
      </button>
    </Drawer>
  )
}

// Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo (section 4.2) -- skipped while a
// text input/textarea/select is focused so native in-field undo (e.g.
// retyping a day name) isn't hijacked by the app-level routine undo.
function useUndoRedoKeybinding() {
  const dispatch = useDispatch()
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])
}

function AppShell() {
  const { state } = useStore()
  const [activeScreen, setActiveScreen] = useState('library')
  const [bodyMapFeed, setBodyMapFeed] = useState(EMPTY_BODY_MAP_FEED)
  const screen = SCREENS.find((s) => s.id === activeScreen)
  const { Component } = screen

  useUndoRedoKeybinding()

  // First-run wizard: no routines and no sessions yet, and it hasn't
  // already been dismissed. Sticky via onboardingComplete so clearing
  // everything later doesn't retrigger it.
  if (!state.onboardingComplete && state.routines.length === 0 && state.sessions.length === 0) {
    return <Onboarding onDone={() => setActiveScreen('routine')} />
  }

  return (
    <div className="sx-app">
      <ShareImportPrompt onImported={() => setActiveScreen('routine')} />
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
