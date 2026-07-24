import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { preloadKaChing } from './lib/kaChing'
import { scheduleSupabasePulse } from './lib/supabasePulse'
import './index.css'

preloadKaChing()
scheduleSupabasePulse()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
