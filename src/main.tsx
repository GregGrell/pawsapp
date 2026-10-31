import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { today } from './lib/time'

// Updates: checked whenever the app is opened, plus once a day at 07:00 Qatar time
// so phones that keep PAWSapp open all the time still pick up new versions.
const LAST_CHECK = 'paws-update-check'
const checkHour = 7

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const due = () => {
      const now = new Date()
      const qatarHour = (now.getUTCHours() + 3) % 24
      let last = ''
      try { last = localStorage.getItem(LAST_CHECK) ?? '' } catch { /* storage unavailable */ }
      return qatarHour >= checkHour && last !== today(now)
    }
    const check = () => {
      if (!navigator.onLine || !due()) return
      try { localStorage.setItem(LAST_CHECK, today()) } catch { /* storage unavailable */ }
      reg.update().catch(() => {})
    }
    // Phones pause timers while asleep, so check on a short tick and whenever the app comes back into view.
    setInterval(check, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    window.addEventListener('online', check)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
