import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { demoAccess, getAccess, signInWithGoogle, signOut } from './authService'
import { clearOfflineUser } from '../../lib/offlineStore'
import { ADMIN_ROLES, ROLES } from './roles'

const AuthContext = createContext(null)

/** Batas maksimum boot auth — setelah ini loading dipaksa selesai supaya UI tidak muter selamanya. */
const BOOT_TIMEOUT_MS = 15000

/** Bersihkan sisa query OAuth (?code / ?error) setelah sesi terbentuk. */
function cleanOAuthParams() {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('error_description')) {
      url.searchParams.delete('code')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
  } catch {}
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  const accessSeq = useRef(0)

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined }
    let active = true
    const bootTimer = setTimeout(() => {
      if (active) setLoading((prev) => (prev ? false : prev))
    }, BOOT_TIMEOUT_MS)

    const loadAccess = async (nextSession) => {
      const seq = (accessSeq.current += 1)
      if (!nextSession) {
        if (active && seq === accessSeq.current) { setAccess(null); setLoading(false) }
        return
      }
      // Ada sesi tapi profil belum ada → tetap loading sampai profil selesai dimuat.
      if (active && seq === accessSeq.current) setLoading(true)
      try {
        const nextAccess = await getAccess()
        if (active && seq === accessSeq.current) {
          setAccess(nextAccess)
          // nextAccess null = user sudah login Google tapi baris profil belum ada
          // (mis. trigger handle_new_user gagal / RPC error). Jangan nyangkut:
          // hentikan loading supaya LoginPage bisa menampilkan pesan + aksi.
          setLoading(false)
        }
      } catch {
        if (active && seq === accessSeq.current) {
          setError('Profil akses tidak dapat dimuat. Coba muat ulang halaman atau masuk kembali.')
          setLoading(false)
        }
      }
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        setError('Sesi masuk tidak dapat dimuat. Coba muat ulang halaman.')
        setLoading(false)
        return
      }
      setSession(data.session)
      if (data.session) cleanOAuthParams()
      void loadAccess(data.session)
    }).catch(() => {
      if (active) {
        setError('Sesi masuk tidak dapat dimuat. Coba muat ulang halaman.')
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      // Event awal INITIAL_SESSION sudah ditangani getSession() di atas —
      // abaikan supaya tidak double-fetch dan tidak me-reset error/loading.
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        accessSeq.current += 1
        setSession(null)
        setAccess(null)
        setLoading(false)
        return
      }
      setSession(nextSession)
      if (nextSession) cleanOAuthParams()
      void loadAccess(nextSession)
    })
    return () => { active = false; clearTimeout(bootTimer); listener.subscription.unsubscribe() }
  }, [])

  const clearAuthError = () => setError('')

  useEffect(() => { if (access) clearAuthError() }, [access])

  const role = access?.role ?? null

  const value = useMemo(() => ({
    session, access, role, loading, error,
    isDeveloper: role === ROLES.DEVELOPER,
    isAdminArea: ADMIN_ROLES.includes(role),
    isAuthenticated: Boolean(session) || Boolean(access?.user_id?.startsWith('demo-')),
    isDemo: Boolean(access?.user_id?.startsWith('demo-')),
    setDemoAccess: (role) => { setError(''); setAccess(demoAccess[role] ?? null); setSession(null); setLoading(false) },
    clearDemoAccess: () => { setAccess(null) },
    signOutDemo: () => { setAccess(null); setSession(null) },
    signInWithGoogle: async () => { setError(''); try { await signInWithGoogle() } catch (err) { setError(err.message || 'Gagal masuk dengan Google.'); throw err } },
    refreshAccess: async () => { setLoading(true); try { const next = await getAccess(); setAccess(next); return next } finally { setLoading(false) } },
    signOut: async () => {
      try {
        const uid = session?.user?.id || access?.user_id
        if (uid) { try { await clearOfflineUser(uid) } catch {} }
      } catch {}
      await signOut(); setSession(null); setAccess(null)
    },
  }), [access, error, loading, role, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider.')
  return value
}
