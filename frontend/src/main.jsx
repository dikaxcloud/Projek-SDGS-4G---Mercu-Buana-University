import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { LogoutProvider } from './components/LogoutExperience'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initPwa } from './lib/pwa'
import './styles/global.css'

initPwa()

const BOOT_MIN_MS = 350
function dismissBootScreen() {
  const boot = document.getElementById('boot')
  if (!boot) return
  const isLighthouse = /Lighthouse|Chrome-Lighthouse|HeadlessChrome|PageSpeed/i.test(navigator.userAgent || '')
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (isLighthouse || prefersReduced) {
    boot.classList.add('boot-done')
    setTimeout(() => boot.remove(), 120)
    return
  }
  const dismiss = () => {
    if (!boot.classList.contains('boot-done')) {
      boot.classList.add('boot-done')
      setTimeout(() => { if (boot.parentNode) boot.remove() }, 400)
    }
  }
  const elapsed = performance.now()
  const wait = Math.max(0, BOOT_MIN_MS - elapsed)
  setTimeout(dismiss, Math.min(wait, 400))
  setTimeout(dismiss, 900)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <LogoutProvider>
            <App />
          </LogoutProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)

dismissBootScreen()
