import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Printer, RefreshCw, Share2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyCitizenQr, getMyHealthHistory } from '../features/health/healthService'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'
import { useAuth } from '../features/auth/AuthProvider'
import { isSupabaseConfigured } from '../lib/supabase'

export function CitizenQrPage() {
  const navigate = useNavigate()
  const { access } = useAuth()
  const linked = Boolean(access?.citizen_id)
  const [data, setData] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareMsg, setShareMsg] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    if (!isSupabaseConfigured) {
      setData({ state: 'no_citizen' }); setLoading(false); return
    }
    Promise.all([getMyCitizenQr(), access?.citizen_id ? getMyHealthHistory(1) : Promise.resolve([])])
      .then(async ([qr]) => {
        if (!active) return
        setData(qr)
        if (qr?.state === 'ready' && qr.token) setQrUrl(await makeQrDataUrl(`DSK1:${qr.token}`, 420))
      })
      .catch((err) => { if (active) setError(err.message || 'QR belum dapat dimuat.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const share = async () => {
    try {
      const file = qrUrl ? await (await fetch(qrUrl)).blob() : null
      const payload = { title: 'QR Kesehatan Saya', text: `Kesehatan warga desa — ${data?.full_name ?? ''}` }
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...payload, files: [file] })
      else await navigator.share(payload)
    } catch { setShareMsg('Bagikan tidak didukung perangkat ini. Gunakan Unduh atau Cetak.') }
  }

  const verified = data?.verification_status === 'verified'

  return (
    <div className="dashboard-page"><div className="container narrow-container">
      <Link className="back-link" to="/warga"><ArrowLeft size={15} /> Kembali ke beranda</Link>
      <div className="form-heading"><div className="icon-tile">🪪</div><div><div className="eyebrow">Portal warga</div><h1 className="display">QR Kesehatan Saya</h1></div></div>
      <p className="page-intro">Tunjukkan QR ini kepada petugas kesehatan saat pemeriksaan — petugas dapat langsung menemukan data Anda.</p>

      {error && <div className="staff-alert" role="alert">{error}</div>}
      {loading && <p className="muted-text">Memuat QR...</p>}

      {!loading && !error && (
        <>
          {(!linked) && (
            <div className="staff-alert">Akun Anda belum terhubung ke profil warga.</div>
          )}
          {linked && data?.state === 'no_citizen' && (
            <div className="staff-alert">QR belum tersedia. QR aktif otomatis setelah admin memverifikasi data Anda.</div>
          )}
          {linked && data?.state === 'ready' && !verified && (
            <div className="staff-alert" style={{ background: '#fff8e7', borderColor: '#fde68a', color: '#92400e' }}>Status akun Anda belum terverifikasi sehingga QR belum dapat ditampilkan.</div>
          )}
          {linked && data?.state === 'ready' && verified && qrUrl && (
            <section className="panel" style={{ textAlign: 'center' }}>
              <img src={qrUrl} alt="QR Kesehatan Saya" style={{ width: 'min(300px, 80%)', margin: '8px auto', borderRadius: 16, border: '1px solid var(--line)', background: '#fff', padding: 10 }} />
              <h2 style={{ fontSize: '1.2rem', margin: '10px 0 2px' }}>{data.full_name}</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                Status: 🟢 Terverifikasi &nbsp;·&nbsp; RT {String(data.rt_code || '').replace('RT ', '')} &nbsp;·&nbsp; KK {data.household_number}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Dibuat {new Date(data.created_at).toLocaleDateString('id-ID')} · Token aman tanpa NIK/data kesehatan</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" className="btn btn-primary" onClick={() => downloadQr(qrUrl, 'qr-kesehatan-saya.png')}><Download size={16} /> Unduh QR</button>
                <button type="button" className="btn btn-ghost" onClick={() => printQr(qrUrl, 'QR Kesehatan Warga', `${data.full_name} · RT ${String(data.rt_code || '').replace('RT ', '')}`)}><Printer size={16} /> Cetak</button>
                <button type="button" className="btn btn-ghost" onClick={() => void share()}><Share2 size={16} /> Bagikan</button>
              </div>
              {shareMsg && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{shareMsg}</p>}
            </section>
          )}
          {!loading && linked && data?.verification_status === 'rejected' && (
            <div className="staff-alert" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b42318' }}>
              Pendaftaran Anda ditolak{data.full_name ? '' : ''}. Silakan hubungi petugas desa.
            </div>
          )}
        </>
      )}
      {!loading && (!data || data.state === 'none') && linked && (
        <div className="staff-alert">QR belum dibuat untuk akun Anda. Hubungi petugas desa setelah data diverifikasi.<RefreshCw size={15} /></div>
      )}
    </div></div>
  )
}
