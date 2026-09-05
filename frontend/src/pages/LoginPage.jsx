import { useEffect, useState } from 'react'
import { ArrowLeft, ShieldCheck, Eye, EyeOff, Mail, Lock, Heart, Activity, Stethoscope, Users, Sparkles, ArrowRight } from 'lucide-react'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)

  const welcomeParam = searchParams.get('welcome')
  const isInvitationParam = welcomeParam === 'invitation' || (typeof window !== 'undefined' && (() => {
    try { return sessionStorage.getItem('pending_welcome') === 'invitation' } catch { return false }
  })())

  useEffect(() => {
    try {
      if (welcomeParam === 'invitation') sessionStorage.setItem('pending_welcome', 'invitation')
    } catch {}
  }, [welcomeParam])

  const [isInvitedViaMetadata, setIsInvitedViaMetadata] = useState(false)
  const [metadataChecked, setMetadataChecked] = useState(false)

  useEffect(() => {
    if (!access || authLoading || isInvitationParam) { setMetadataChecked(true); return }
    if (!supabase) { setMetadataChecked(true); return }
    let active = true
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

  const [hasLoginFlag, setHasLoginFlag] = useState(() => {
    try { return sessionStorage.getItem('welcome_login') === '1' } catch { return false }
  })
  useEffect(() => {
    try {
      if (sessionStorage.getItem('welcome_login') === '1') setHasLoginFlag(true)
    } catch {}
  }, [authLoading, access])

  const isWelcomeLogin = hasLoginFlag && Boolean(access) && !authLoading
  const showWelcome = (isInvitation && Boolean(access) && !authLoading && (isInvitationParam || metadataChecked)) || isWelcomeLogin
  const welcomeIsInvitation = isInvitation

  const redirectByRole = (role, citizenId) => {
    try {
      if (access?.user_id) localStorage.setItem(`welcome_invitation_shown_${access.user_id}`, '1')
      sessionStorage.removeItem('pending_welcome')
      sessionStorage.removeItem('welcome_login')
      setHasLoginFlag(false)
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
    if (showWelcome) return
    if (!isInvitationParam && !metadataChecked && !authLoading && !hasLoginFlag) return
    if (access.role === 'warga') navigate(access.citizen_id ? '/warga' : '/registrasi', { replace: true })
    if (access.role === 'nakes') navigate('/nakes', { replace: true })
    if (access.role === 'admin') navigate('/admin', { replace: true })
  }, [access, navigate, showWelcome, isInvitationParam, metadataChecked, authLoading, hasLoginFlag])

  const useGoogle = async () => {
    try { sessionStorage.setItem('welcome_login', '1'); setHasLoginFlag(true) } catch {}
    setLoading(true); setMessage('')
    try { await signInWithGoogle() } catch (err) { setMessage(err.message || 'Gagal masuk dengan Google.') } finally { setLoading(false) }
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { setMessage('Masukkan email dan password.'); return }
    setEmailLoading(true); setMessage('')
    // Email/password belum dikonfigurasi sebagai provider utama — arahkan ke Google
    setTimeout(() => {
      setEmailLoading(false)
      setMessage('Login email belum diaktifkan. Silakan gunakan "Masuk dengan Google" untuk melanjutkan.')
    }, 900)
  }

  if (showWelcome) {
    return (
      <WelcomeTransition
        access={access}
        isInvitation={welcomeIsInvitation}
        onComplete={(role) => redirectByRole(role, access?.citizen_id)}
      />
    )
  }

  if ((isInvitationParam && authLoading) || (!isInvitationParam && access && !authLoading && !metadataChecked)) {
    return (
      <main className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Brand /></div>
        <h1 className="display">Memeriksa undangan...</h1>
        <p>Memvalidasi undangan Anda. Mohon tunggu sebentar.</p>
      </div></main>
    )
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* LEFT VISUAL */}
        <div className="login-visual">
          <Link to="/" className="login-back"><ArrowLeft size={15} /> Kembali ke beranda</Link>
          <div className="login-visual-inner">
            <div className="login-illustration-wrap">
              <div className="login-blob" />
              <div className="login-illustration">
                <div className="login-ill-card main">
                  <div className="login-ill-icon"><Stethoscope size={22} /></div>
                  <div>
                    <strong>Tenaga Kesehatan</strong>
                    <span>Siap membantu warga</span>
                  </div>
                  <span className="login-ill-dot online" />
                </div>
                <div className="login-ill-card small top">
                  <Heart size={16} color="#e11d48" />
                  <span>Sehat bersama</span>
                </div>
                <div className="login-ill-card small bottom">
                  <Users size={16} color="#0f766e" />
                  <span>Komunitas desa</span>
                </div>
                <div className="login-ill-pulse" />
              </div>
              <div className="login-float-icon f1"><Heart size={14} /></div>
              <div className="login-float-icon f2"><Activity size={14} /></div>
              <div className="login-float-icon f3"><Sparkles size={14} /></div>
            </div>
            <h1 className="login-headline">Selamat datang kembali <span>👋</span></h1>
            <p className="login-sub">Pantau kesehatan Anda dengan lebih mudah, aman, dan terhubung.</p>
            <p className="login-desc">Desa Sehat Kenanga membantu warga mengakses informasi kesehatan, melihat riwayat pemeriksaan, dan tetap terhubung dengan tenaga kesehatan.</p>
            <div className="login-visual-footer">
              <span className="login-tag"><ShieldCheck size={14} /> Aman & terpercaya</span>
              <span className="login-tag"><Heart size={14} /> Untuk keluarga</span>
            </div>
          </div>
        </div>

        {/* RIGHT CARD */}
        <div className="login-card-wrap">
          <div className="login-card">
            <div className="login-card-brand"><Brand /></div>
            <h2 className="login-card-title">Masuk ke akun Anda</h2>
            <p className="login-card-sub">Gunakan akun Anda untuk melanjutkan ke Desa Sehat Kenanga.</p>

            <button className={`btn login-google ${loading ? 'loading' : ''}`} onClick={useGoogle} disabled={loading || loginSuccess}>
              {loading ? <span className="spin" style={{ display: 'inline-grid' }}><Activity size={18} /></span> : <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.99 6.99 0 015.48 12c0-.72.13-1.42.36-2.09V7.07H2.18A11 11 0 001 12c0 1.78.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
              <span>{loading ? 'Menghubungkan...' : loginSuccess ? 'Berhasil!' : 'Masuk dengan Google'}</span>
            </button>

            <div className="login-divider"><span>atau</span></div>

            <form className="login-form" onSubmit={handleEmailLogin} noValidate>
              <label className="login-field">
                <span>Email</span>
                <span className="login-input-wrap">
                  <Mail size={16} className="login-input-icon" />
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Masukkan email Anda" autoComplete="email" />
                </span>
              </label>
              <label className="login-field">
                <span>Password</span>
                <span className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" />
                  <button type="button" className="login-eye" onClick={()=>setShowPass(v=>!v)} aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              <div className="login-form-foot">
                <Link to="#" onClick={e=>{e.preventDefault(); setMessage('Fitur lupa password akan segera tersedia. Hubungi admin desa.')}} className="login-forgot">Lupa password?</Link>
              </div>
              <button type="submit" className={`btn btn-primary login-submit ${emailLoading ? 'loading' : ''}`} disabled={emailLoading}>
                {emailLoading ? <><span className="spin" style={{ display: 'inline-grid' }}><Activity size={16} /></span> Memeriksa akun...</> : <>Masuk <ArrowRight size={16} /></>}
              </button>
            </form>

            {(message || authError) && <p role="alert" className="login-alert">{message || authError}</p>}

            <div className="login-card-info">
              <strong>Belum terhubung sebagai warga?</strong><br />
              Login dengan Google, lalu lengkapi data pendaftaran. Akun aktif setelah diverifikasi admin desa.
            </div>
            <div className="login-register">
              Belum punya akun? <Link to="/registrasi" className="login-register-link">Daftar sekarang</Link>
            </div>

            <div className="login-branding">
              <span>Portal Kesehatan Desa</span>
              <span className="login-branding-dot">•</span>
              <span>Desa Sehat Kenanga</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
