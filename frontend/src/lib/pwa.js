// PWA manager — single registration, form-safe auto-update.
// Tidak menyimpan token / NIK / data kesehatan. Hanya mengatur SW + install prompt.
let registration = null
let waitingWorker = null
const listeners = new Set()
let deferredPrompt = null
let promptCaptured = false

function emit(state) {
  listeners.forEach((fn) => {
    try { fn(state) } catch { /* abaikan listener rusak */ }
  })
}

export function getPwaState() {
  return {
    registration,
    waitingWorker,
    hasUpdate: Boolean(waitingWorker),
    canInstall: Boolean(deferredPrompt),
    isStandalone:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        window.navigator?.standalone === true),
  }
}

export function subscribePwa(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Form pemeriksaan / profil yang belum disimpan menandai dirinya lewat flag ini.
// ExaminationPage mengeset window.__DS_HAS_UNSAVED_CHANGES = true saat ada isian.
export function hasUnsavedChanges() {
  try {
    if (window.__DS_HAS_UNSAVED_CHANGES === true) return true
    return Boolean(document.querySelector('form[data-dirty="true"]'))
  } catch {
    return false
  }
}

export function markUnsaved(dirty) {
  try { window.__DS_HAS_UNSAVED_CHANGES = Boolean(dirty) } catch { /* noop */ }
}

export function applySwUpdate() {
  try {
    if (waitingWorker) {
      waitingWorker.postMessage('SKIP_WAITING')
      return true
    }
    if (registration?.waiting) {
      registration.waiting.postMessage('SKIP_WAITING')
      return true
    }
  } catch { /* reload sebagai fallback */ }
  try { window.location.reload() } catch { /* noop */ }
  return false
}

export async function promptInstall() {
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      deferredPrompt = null
      emit(getPwaState())
      return choice?.outcome === 'accepted'
    } catch {
      return false
    }
  }
  return false
}

export function installInstructions() {
  const ua = (navigator.userAgent || '').toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIos) return 'Di Safari iPhone: ketuk tombol Bagikan (kotak + panah ke atas), gulir, lalu pilih "Tambah ke Layar Utama" > "Tambah".'
  if (/samsungbrowser/.test(ua)) return 'Ketuk ikon ⋮ di Samsung Internet, lalu pilih "Tambahkan ke layar utama" / "Instal aplikasi".'
  if (/firefox/.test(ua)) return 'Ketuk ikon ⋮ di Firefox Android, lalu pilih "Instal" atau "Tambah ke Layar Utama".'
  if (/chrome|crios/.test(ua)) return 'Ketuk ikon ⋮ di Chrome Android, lalu pilih "Tambahkan ke Layar Utama" / "Instal aplikasi".'
  return 'Buka menu browser (⋮), lalu pilih "Tambahkan ke Layar Utama" atau "Instal aplikasi".'
}

function watchWorker(worker) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = worker
      emit(getPwaState())
    }
  })
}

export function initPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (window.__DS_PWA_INIT) return
  window.__DS_PWA_INIT = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    promptCaptured = true
    emit(getPwaState())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit(getPwaState())
  })

  const onLoad = () => {
    if (!import.meta.env.PROD) return
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting
          emit(getPwaState())
        }
        reg.addEventListener('updatefound', () => watchWorker(reg.installing))
        // Cek versi baru tiap 30 menit + saat tab kembali terlihat.
        const check = () => {
          try { reg.update() } catch { /* offline — versi lama tetap jalan */ }
        }
        window.setInterval(check, 30 * 60 * 1000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void check()
        })
        emit(getPwaState())
      })
      .catch(() => {})

    // Terapkan versi baru hanya saat aman: tidak ada reload otomatis di tengah form.
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      try { window.location.reload() } catch { /* noop */ }
    })
  }

  if (document.readyState === 'complete') onLoad()
  else window.addEventListener('load', onLoad, { once: true })
}

export function wasInstallPromptCaptured() {
  return promptCaptured
}
