import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/meridian.css'
import './styles/app.css'
import './styles/gm.css'
import './styles/stage.css'
import './styles/codex.css'
import './styles/station.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
