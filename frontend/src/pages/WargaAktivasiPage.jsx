import { useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { activateMyAccount } from '../features/auth/authService'

/** Warga scans admin's activation QR -> lands here with ?t=<token> -> account unlocked. */
export function WargaAktivasiPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [state, setState] = useState(token ? 'activating' : 'no_token')

  useEffect(() => {
    if (!token) return
    let active = true
    activateMyAccount(token)
      .then((res) => { if (active) setState(res?.status ?? 'invalid_token') })
      .catch(() => { if (active) setState('invalid_token') })
    return () => { active = false }
  }, [token])

  return (
    <main className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Brand /></div>
      {state === 'activating' && (
        <>
          <h1 className="display">Mengaktifkan akun…</h1>
          <p>Memeriksa token aktivasi Anda.</p>
        </>
      )}
      {state === 'activated' && (
        <>
          <CheckCircle2 size={52} color="#15803d" style={{ margin: '10px auto' }} />
          <h1 className="display">Akun Aktif! 🎉</h1>
          <p>Akun kesehatan Anda berhasil diaktifkan. QR Kesehatan pribadi Anda sudah tersedia di menu 🪪 QR Saya.</p>
          <button className="btn btn-primary btn-wide" style={{ marginTop: 16 }} onClick={() => navigate('/warga', { replace: true })}>Masuk ke Dashboard</button>
        </>
      )}
      {(state === 'already_active') && (
        <>
          <CheckCircle2 size={52} color="#15803d" style={{ margin: '10px auto' }} />
          <h1 className="display">Akun Sudah Aktif</h1>
          <button className="btn btn-primary btn-wide" style={{ marginTop: 16 }} onClick={() => navigate('/warga', { replace: true })}>Masuk ke Dashboard</button>
        </>
      )}
      {(state === 'no_token' || state === 'invalid_token' || state === 'expired') && (
        <>
          <XCircle size={52} color="#b42318" style={{ margin: '10px auto' }} />
          <h1 className="display">{state === 'expired' ? 'Kode Kedaluwarsa' : 'QR Tidak Valid'}</h1>
          <p>{state === 'expired' ? 'Kode aktivasi sudah kedaluwarsa.' : 'Token tidak dikenali.'} Minta petugas desa menampilkan QR aktivasi yang baru, lalu scan ulang.</p>
          <button className="btn btn-ghost btn-wide" style={{ marginTop: 16 }} onClick={() => navigate(0)}><RefreshCw /> Coba periksa ulang</button>
        </>
      )}
      {state === 'no_citizen' && (
        <>
          <XCircle size={52} color="#b42318" style={{ margin: '10px auto' }} />
          <h1 className="display">Belum Terhubung</h1>
          <p>Akun Google ini belum terhubung ke profil warga mana pun.</p>
        </>
      )}
    </div></main>
  )
}
