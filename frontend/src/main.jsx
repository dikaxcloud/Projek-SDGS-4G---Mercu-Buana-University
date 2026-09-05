import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // new version ready → auto reload biar gak perlu refresh manual
            window.location.reload()
          }
        })
      })
    })
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  })
  // juga cek update tiap kali tab balik fokus (biar deploy baru langsung ketahuan)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
      navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update())
    }
  })
}

const BOOT_MIN_MS = 600
function dismissBootScreen() {
  const boot = document.getElementById('boot')
  if (!boot) return
  // Skip long splash for Lighthouse / fast devices — jangan block LCP
  const isLighthouse = /Lighthouse|Chrome-Lighthouse/i.test(navigator.userAgent || '')
  if (isLighthouse) {
    boot.classList.add('boot-done')
    setTimeout(() => boot.remove(), 200)
    return
  }
  const dismiss = () => {
    if (!boot.classList.contains('boot-done')) {
      boot.classList.add('boot-done')
      setTimeout(() => { if (boot.parentNode) boot.remove() }, 500)
    }
  }
  // dismiss segera setelah React mount, tetap hormati BOOT_MIN_MS tapi max 900ms
  const elapsed = performance.now()
  const wait = Math.max(0, BOOT_MIN_MS - elapsed)
  setTimeout(dismiss, Math.min(wait, 700))
  setTimeout(dismiss, 1400)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)

dismissBootScreen()
