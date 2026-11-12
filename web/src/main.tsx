import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/meridian.css'
import './styles/app.css'
import './styles/gm.css'
import './styles/stage.css'
import './styles/codex.css'
import './styles/station.css'
import './styles/fight.css'
import './styles/rolls.css'
import './styles/overview.css'
import './styles/slots.css'
import './styles/login.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
