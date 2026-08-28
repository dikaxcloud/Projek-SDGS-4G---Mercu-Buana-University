import { useEffect, useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/AuthProvider'
import { WelcomeTransition } from '../components/WelcomeTransition'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { access, loading: authLoading, signInWithGoogle, error: authError } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const welcomeParam = searchParams.get('welcome')
  // Persist welcome param across supabase's detectSessionInUrl cleanup (it strips ?code but may also strip custom params)
  const isInvitationParam = welcomeParam === 'invitation' || (typeof window !== 'undefined' && (() => {
    try { return sessionStorage.getItem('pending_welcome') === 'invitation' } catch { return false }
  })())

  useEffect(() => {
    try {
      if (welcomeParam === 'invitation') sessionStorage.setItem('pending_welcome', 'invitation')
    } catch {}
  }, [welcomeParam])

  // Fallback: detect invitation via user_metadata.invited_by (for cases where edge function not yet redeployed or SITE_URL missing)
  const [isInvitedViaMetadata, setIsInvitedViaMetadata] = useState(false)
  const [metadataChecked, setMetadataChecked] = useState(false)

  useEffect(() => {
    if (!access || authLoading || isInvitationParam) { setMetadataChecked(true); return }
    if (!supabase) { setMetadataChecked(true); return }
    // Only check once per access
    let active = true
    // Do not re-trigger if already shown for this user (prevents normal login showing welcome)
    // For nakes/admin invites we want to show even if user already had a prior normal login, so only skip if flag set AND user has logged in before as non-invite
    try {
      const flagKey = `welcome_invitation_shown_${access.user_id}`
      if (localStorage.getItem(flagKey)) { if (active) { setIsInvitedViaMetadata(false); setMetadataChecked(true) }; return }
    } catch {}
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const invitedBy = data?.user?.user_metadata?.invited_by
      const isInvited = Boolean(invitedBy)
      setIsInvitedViaMetadata(isInvited)
      setMetadataChecked(true)
    }).catch(() => { if (active) { setIsInvitedViaMetadata(false); setMetadataChecked(true) } })
    return () => { active = false }
  }, [access, authLoading, isInvitationParam])

  const isInvitation = isInvitationParam || (metadataChecked && isInvitedViaMetadata)
  // Show welcome ONLY after invitation token validated: access exists + not loading + (welcome param OR invited metadata)
  const showWelcome = isInvitation && Boolean(access) && !authLoading && (isInvitationParam || metadataChecked)

  const redirectByRole = (role, citizenId) => {
    // Mark welcome as shown for this user to prevent re-show on normal login
    try {
      if (access?.user_id) localStorage.setItem(`welcome_invitation_shown_${access.user_id}`, '1')
      sessionStorage.removeItem('pending_welcome')
      // Clear welcome param from URL to prevent back-button replay
      const url = new URL(window.location.href)
      if (url.searchParams.has('welcome')) {
        url.searchParams.delete('welcome')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    } catch {}
    if (role === 'warga') navigate(citizenId ? '/warga' : '/registrasi', { replace: true })
    else if (role === 'nakes') navigate('/nakes', { replace: true })
    else if (role === 'admin') navigate('/admin', { replace: true })
    else navigate('/', { replace: true })
  }

  useEffect(() => {
    if (!access) return
    // CRITICAL: invitation welcome takes precedence – do NOT auto-redirect, let transition handle it
    if (showWelcome) return
    // While we are still checking invited metadata (fallback without welcome param), don't redirect yet
    if (!isInvitationParam && !metadataChecked && !authLoading) return
    if (access.role === 'warga') navigate(access.citizen_id ? '/warga' : '/registrasi', { replace: true })
    if (access.role === 'nakes') navigate('/nakes', { replace: true })
    if (access.role === 'admin') navigate('/admin', { replace: true })
  }, [access, navigate, showWelcome, isInvitationParam, metadataChecked, authLoading])
  const useGoogle = async () => {
    setLoading(true); setMessage('')
    try { await signInWithGoogle() } catch (err) { setMessage(err.message || 'Gagal masuk dengan Google.') } finally { setLoading(false) }
  }

  // INVITATION WELCOME TRANSITION - only after token validated (access exists)
  if (showWelcome) {
    return (
      <WelcomeTransition
        access={access}
        onComplete={(role) => redirectByRole(role, access?.citizen_id)}
      />
    )
  }

  // While invitation token is being validated, show checking state (not welcome)
  if ((isInvitationParam && authLoading) || (!isInvitationParam && access && !authLoading && !metadataChecked)) {
    return (
      <main className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Brand /></div>
        <h1 className="display">Memeriksa undangan...</h1>
        <p>Memvalidasi undangan Anda. Mohon tunggu sebentar.</p>
      </div></main>
    )
  }

  return <main className="auth-page"><div className="auth-card">
    <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13 }}><ArrowLeft size={15} /> Kembali ke beranda</Link>
    <div style={{ marginTop: 25 }}><Brand /></div>
    <h1 className="display">Masuk ke Desa Sehat</h1>
    <p>Gunakan akun Google Anda untuk masuk sebagai warga, tenaga kesehatan, atau admin desa.</p>
    <button className="btn btn-primary btn-wide" onClick={useGoogle} disabled={loading}><ShieldCheck size={17} /> {loading ? 'Menghubungkan...' : 'Masuk dengan Google'}</button>
    {(message || authError) && <p role="alert" style={{ color: '#b42318', fontSize: 13 }}>{message || authError}</p>}
    <div style={{ marginTop: 18, padding: 14, borderRadius: 13, background: '#f0faf7', border: '1px solid var(--line)', fontSize: 12.5, lineHeight: 1.6 }}>
      <strong>Belum terhubung sebagai warga?</strong><br />
      Login dengan Google, lalu lengkapi data pendaftaran. Akun aktif setelah diverifikasi admin desa.<br /><br />
      <strong>Nakes / Admin?</strong><br />
      Login dengan akun Google yang telah didaftarkan admin desa.
    </div>
  </div></main>
}
