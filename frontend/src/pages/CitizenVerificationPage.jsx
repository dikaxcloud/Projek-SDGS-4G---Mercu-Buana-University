import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, BellRing, CheckCircle2, Download, Printer, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { listStaffCitizens } from '../features/staff/staffService'
import { issueActivation } from '../features/admin/adminService'
import { subscribeToCitizenInserts } from '../lib/realtime'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'

export function CitizenVerificationPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [liveAlert, setLiveAlert] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    listStaffCitizens({ status: 'pending_verification', limit: 100 })
      .then(setRows)
      .catch((err) => setError(err.message || 'Data belum dapat dimuat.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // Realtime: notif otomatis saat warga baru mengisi identitas.
  useEffect(() => subscribeToCitizenInserts((newRow) => {
    setLiveAlert({ name: newRow.full_name, at: new Date() })
    load()
  }), [load])

  // Lazy import to avoid circular deps with admin RPCs living in adminService.
  const verifyCitizen = async (citizenId, approve, note) => {
    setBusyId(citizenId); setError(''); setNotice(''); setQrResult(null)
    try {
      const { supabase } = await import('../lib/supabase')
      const { data, error: rpcError } = await supabase.rpc('admin_verify_citizen', { p_citizen_id: citizenId, p_approve: approve, p_reason: approve ? null : (note ?? '') })
      if (rpcError) throw rpcError
      if (approve) {
        // QR AKTIVASI AKUN: warga scan ini (login Google di HP-nya) untuk membuka akun. Berlaku 30 menit.
        const act = await issueActivation(citizenId)
        if (act?.token) {
          const url = await makeQrDataUrl(`${window.location.origin}/warga/aktivasi?t=${encodeURIComponent(act.token)}`, 380)
          setQrResult({ citizenId, url, kind: 'activation', code: act.code ?? act.token })
        }
        setNotice('✅ Terverifikasi! Minta warga SCAN QR AKTIVASI di bawah, ATAU ketik KODE MANUAL-nya di menu scan warga — setelah itu akun warga langsung terbuka.')
      } else {
        setNotice('Pendaftaran ditolak dengan alasan tercatat.')
      }
      load()
    } catch (err) {
      setError(err.message || 'Aksi belum berhasil.')
    } finally {
      setBusyId(null); setRejecting(null); setReason('')
    }
  }
  const [qrResult, setQrResult] = useState(null)

  return (
    <div className="admin-page"><div className="container narrow-container">
      <Link className="back-link" to="/admin"><ArrowLeft size={15} /> Kembali</Link>
      <div className="form-heading"><div className="icon-tile"><ShieldCheck size={21} /></div><div><div className="eyebrow">Portal admin</div><h1 className="display">Verifikasi Warga</h1></div></div>
      <p className="page-intro">Periksa data pendaftaran warga. Setelah disetujui, tampilkan QR AKTIVASI agar warga memindainya — akun warga baru terbuka setelah scan.</p>

      {liveAlert && (
        <div className="staff-alert" role="status" style={{ background: '#f0f7ff', borderColor: '#bfdcff', color: '#1d4ed8', marginBottom: 12 }}>
          <BellRing size={17} />
          <span>🔔 <strong>Pendaftaran baru masuk!</strong> {liveAlert.name} baru saja mengisi identitas — daftar di bawah otomatis diperbarui ({liveAlert.at.toLocaleTimeString('id-ID')}).</span>
          <button className="btn btn-ghost" onClick={() => setLiveAlert(null)}>Tutup</button>
        </div>
      )}
      {error && <div className="staff-alert" role="alert"><AlertTriangle size={17} /> {error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}
      {notice && (
        <div className="staff-alert" role="status" style={{ background: '#f0faf7', borderColor: '#bfe3da', color: 'var(--teal-dark)', flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={17} /> {notice}</div>
          {qrResult && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12 }}>
              <img src={qrResult.url} alt="QR Aktivasi Akun" style={{ width: 170, borderRadius: 10 }} />
              <div style={{ fontSize: 13 }}>
                <strong style={{ fontSize: 15 }}>🔐 QR AKTIVASI AKUN</strong>
                {qrResult.code && (
                  <div style={{ margin: '8px 0', padding: '8px 10px', background: '#f0faf7', border: '1px dashed #9ddbd0', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Kode manual (ketik di scan warga):</div>
                    <strong style={{ fontSize: 22, letterSpacing: 3 }}>{qrResult.code}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Boleh diketik dengan atau tanpa tanda "-".</div>
                  </div>
                )}
                <p style={{ margin: '4px 0' }}>Minta warga scan QR ini lewat kamera HP / menu scan di aplikasi, atau ketik kode manual di atas.<br />Setelah berhasil → akun warga langsung terbuka.</p>
                <p style={{ margin: '4px 0', color: '#b45309', fontWeight: 700 }}>Berlaku 30 menit · sekali pakai</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" onClick={() => downloadQr(qrResult.url, `qr-aktivasi-${qrResult.citizenId}.png`)}><Download size={15} /> Unduh</button>
                  <button className="btn btn-ghost" onClick={() => printQr(qrResult.url, 'Aktivasi Akun Warga', qrResult.code ? `Kode manual: ${qrResult.code}` : 'Scan QR ini menggunakan kamera HP Anda')}><Printer size={15} /> Cetak</button>
                  <Link to={`/admin/warga/${qrResult.citizenId}`} style={{ color: 'var(--teal)', fontWeight: 700, alignSelf: 'center' }}>Detail warga →</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <p className="muted-text">Memuat pendaftar...</p> : rows.length === 0 ? (
        <div className="admin-panel"><p className="muted-text" style={{ margin: 0 }}>🎉 Tidak ada pendaftaran yang menunggu verifikasi.</p></div>
      ) : (
        rows.map((row) => (
          <section className="admin-panel" key={row.citizen_id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong>{row.full_name}</strong>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  NIK ****{row.nik_last4} · KK {row.household_number} · {row.rt_code}
                  <br />Mendaftar: {new Date(row.created_at ?? Date.now()).toLocaleDateString('id-ID')} · Google: {row.google_connected ? '🟢 Terhubung' : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {rejecting === row.citizen_id ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <textarea placeholder="Alasan penolakan (wajib)..." value={reason} onChange={(event) => setReason(event.target.value)} rows={2} style={{ minWidth: 220, padding: 8, borderRadius: 10, border: '1px solid var(--line)' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-danger" disabled={!reason.trim() || busyId === row.citizen_id} onClick={() => void verifyCitizen(row.citizen_id, false, reason)}><XCircle size={15} /> Tolak</button>
                      <button className="btn btn-ghost" onClick={() => { setRejecting(null); setReason('') }}>Batal</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Link className="btn btn-ghost" to={`/admin/warga/${row.citizen_id}`}>Lihat data</Link>
                    <button className="btn btn-primary" disabled={busyId === row.citizen_id} onClick={() => void verifyCitizen(row.citizen_id, true)}><ShieldCheck size={15} /> Verifikasi</button>
                    <button className="btn btn-ghost" onClick={() => setRejecting(row.citizen_id)}><XCircle size={15} /> Tolak</button>
                  </>
                )}
              </div>
            </div>
          </section>
        ))
      )}
    </div></div>
  )
}
