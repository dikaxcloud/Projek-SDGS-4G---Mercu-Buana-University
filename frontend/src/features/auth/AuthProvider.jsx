import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { demoAccess, getAccess, signInWithGoogle, signOut } from './authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined }
    let active = true
    const loadAccess = async (nextSession) => {
      if (!nextSession) { setAccess(null); setLoading(false); return }
      try {
        const nextAccess = await getAccess()
        if (active) setAccess(nextAccess)
      } catch { if (active) setError('Profil akses tidak dapat dimuat.') }
      if (active) setLoading(false)
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError('Sesi masuk tidak dapat dimuat.')
      setSession(data.session)
      void loadAccess(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setTimeout(() => void loadAccess(nextSession), 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const clearAuthError = () => setError('')

  useEffect(() => { if (access) clearAuthError() }, [access])

  const value = useMemo(() => ({
    session, access, loading, error, isAuthenticated: Boolean(session) || Boolean(access?.user_id?.startsWith('demo-')),
    isDemo: Boolean(access?.user_id?.startsWith('demo-')),
    setDemoAccess: (role) => { setError(''); setAccess(demoAccess[role] ?? null); setSession(null); setLoading(false) },
    clearDemoAccess: () => { setAccess(null) },
    signOutDemo: () => { setAccess(null); setSession(null) },
    signInWithGoogle: async () => { setError(''); try { await signInWithGoogle() } catch (err) { setError(err.message || 'Gagal masuk dengan Google.'); throw err } },
    refreshAccess: async () => { const next = await getAccess(); setAccess(next); return next },
    signOut: async () => { await signOut(); setSession(null); setAccess(null) },
  }), [access, error, loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider.')
  return value
}
