import { useState } from 'react'
import { Download, Printer, QrCode } from 'lucide-react'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'

export function QrToolsPage() {
  const [url, setUrl] = useState(() => window.location.origin)
  const [qr, setQr] = useState(null)
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    const target = url.trim() || window.location.origin
    setBusy(true)
    try { setQr(await makeQrDataUrl(target, 480)) } finally { setBusy(false) }
  }

  return (
    <div className="admin-page"><div className="container narrow-container">
      <div className="staff-header"><div><div className="eyebrow">Alat desa</div><h1 className="display">QR Akses Website</h1><p>Cetak QR untuk poster, banner, pos kesehatan, atau kantor desa. Warga cukup scan untuk membuka website.</p></div></div>

      <div className="admin-form">
        <label>Alamat website<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={window.location.origin} /></label>
        <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy}><QrCode size={16} /> {busy ? 'Membuat...' : 'Buat QR'}</button>
      </div>

      {qr && (
        <section className="admin-panel" style={{ textAlign: 'center' }}>
          <img src={qr} alt="QR website" style={{ width: 280, borderRadius: 16, border: '1px solid var(--line)', background: '#fff', padding: 10 }} />
          <p style={{ fontWeight: 800, fontSize: 17, margin: '12px 0 4px' }}>Kesehatan Warga Desa</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>{url.trim()}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => downloadQr(qr, 'qr-website-desa.png')}><Download size={16} /> Unduh PNG</button>
            <button className="btn btn-primary" onClick={() => printQr(qr, 'Kesehatan Warga Desa', `Scan untuk membuka ${url.trim()} — pantau kesehatan keluarga dari HP.`)}><Printer size={16} /> Cetak</button>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>Tips cetak: gunakan ukuran minimal 3×3 cm agar mudah discan. QR ini tidak memerlukan login.</p>
        </section>
      )}
    </div></div>
  )
}
