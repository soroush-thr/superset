import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Section 10: register only over http(s), and only in a real build. The
// file:// standalone build has no origin for a service worker to attach
// to, and must never try. `npm run dev` is excluded too -- sw.js's
// CACHE_VERSION is only rewritten by the build scripts (see
// tools/gen-sw-version.js), so a dev server registering it would leave a
// stale placeholder-versioned cache around across every HMR reload for no
// benefit, since offline support isn't a dev-mode concern anyway.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
  })
}
