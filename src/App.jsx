import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { reducer, initState, saveState, flushSave } from './lib/store.js'

const StoreContext = createContext(null)

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
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

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  )
}

// Placeholder shell. The real four-screen layout, left rail / bottom tabs,
// and design tokens land in Phase 4 (BUILD-PLAN.md section 8).
function AppShell() {
  const { state } = useStore()
  return (
    <div style={{ padding: 24 }}>
      <h1>Superset</h1>
      <p>Routines: {state.routines.length}</p>
    </div>
  )
}
