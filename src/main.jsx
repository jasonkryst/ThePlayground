import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './i18n'
import App from './App'

// autoUpdate: a new deploy activates silently on the next load, with no
// user-facing "update available" prompt (this is a kids'/car-use app).
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
