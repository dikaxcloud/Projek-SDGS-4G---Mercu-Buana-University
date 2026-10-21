import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, BellRing, CheckCircle2, ClipboardCheck, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { listStaffCitizens, requestCitizenCorrection, verifyCitizenRegistration } from '../features/staff/staffService'
import { VerificationModal } from '../components/VerificationModal'
import { subscribeToCitizenInserts } from '../lib/realtime'

const NEEDS_REVIEW = new Set(['pending', 'needs_correction'])

const friendlyError = (err, fallback) => {
  const message = err?.message || ''
  if (/Could not find the function|PGRST202|schema cache/i.test(message)) {
    return 'Fitur ini belum aktif di server. Migrasi database terbaru belum dijalankan.'
  }
  return message || fallback
}

export function CitizenVerificationPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [action, setAction] = useState(null) // { citizenId, mode: 'reject' | 'correction' }
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState('')
  const [liveAlert, setLiveAlert] = useState(null)
  const [verifyRow, setVerifyRow] = useState(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    listStaffCitizens({ status: '', limit: 100 })
      .then((data) => setRows((data ?? []).filter((row) => NEEDS_REVIEW.has(row.verification_status))))
      .catch((err) => setError(friendlyError(err, 'Data belum dapat dimuat.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => subscribeToCitizenInserts((newRow) => {
    setLiveAlert({ name: newRow.full_name, at: new Date() })
    load()
  }), [load])

  const openVerify = (row) => {
    setVerifyError('')
    setVerifyRow(row)
  }

  const confirmVerify = async () => {
    if (!verifyRow || verifyBusy) return
    setVerifyBusy(true); setVerifyError(''); setError(''); setNotice('')
    try {
      await verifyCitizenRegistration(verifyRow.citizen_id, true)
      setNotice(`${verifyRow.full_name} terverifikasi. Buka detail warga untuk menerbitkan QR aktivasi.`)
      setVerifyRow(null)
      load()
    } catch (err) {
      setVerifyError(friendlyError(err, 'Verifikasi belum berhasil.'))
    } finally { setVerifyBusy(false) }
  }

  const submitAction = async () => {
    if (!action || !note.trim()) return
    setBusyId(action.citizenId); setError(''); setNotice('')
    try {
      if (action.mode === 'correction') {
        await requestCitizenCorrection(action.citizenId, note)
        setNotice('Permintaan perbaikan dikirim. Warga dapat memperbaiki data dan mengirim ulang.')
      } else {
        await verifyCitizenRegistration(action.citizenId, false, note)
        setNotice('Pendaftaran ditolak dengan alasan tercatat.')
      }
      setAction(null); setNote('')
      load()
    } catch (err) {
      setError(friendlyError(err, 'Aksi belum berhasil.'))
    } finally { setBusyId(null) }
  }

  return (
    <div className="admin-page"><div className="container narrow-container">
      <Link className="back-link" to="/admin"><ArrowLeft size={15} /> Kembali</Link>
      <div className="form-heading"><div className="icon-tile"><ShieldCheck size={21} /></div><div><div className="eyebrow">Portal admin</div><h1 className="display">Verifikasi Warga</h1></div></div>
      <p className="page-intro">Periksa dan perbaiki data pendaftaran warga. Verifikasi dan penerbitan QR aktivasi adalah dua langkah terpisah.</p>

      {liveAlert && (
        <div className="staff-alert" role="status" style={{ background: '#f0f7ff', borderColor: '#bfdcff', color: '#1d4ed8', marginBottom: 12 }}>
          <BellRing size={17} />
          <span><strong>Pendaftaran baru masuk.</strong> {liveAlert.name} baru saja mengisi identitas — daftar diperbarui ({liveAlert.at.toLocaleTimeString('id-ID')}).</span>
          <button className="btn btn-ghost" onClick={() => setLiveAlert(null)}>Tutup</button>
        </div>
      )}
      {error && <div className="staff-alert" role="alert"><AlertTriangle size={17} /> {error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}
      {notice && <div className="staff-alert" role="status" style={{ background: '#f0faf7', borderColor: '#bfe3da', color: 'var(--teal-dark)' }}><CheckCircle2 size={17} /> {notice}</div>}

      {loading ? <p className="muted-text">Memuat pendaftar...</p> : rows.length === 0 ? (
        <div className="admin-panel"><p className="muted-text" style={{ margin: 0 }}>Tidak ada pendaftaran yang menunggu pemeriksaan.</p></div>
      ) : (
        rows.map((row) => (
          <section className="admin-panel" key={row.citizen_id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{row.full_name}</strong>
                {row.verification_status === 'needs_correction' && <span className="badge" style={{ marginLeft: 8, color: '#b45309', borderColor: '#b45309' }}>Perlu perbaikan</span>}
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  NIK ****{row.nik_last4} · KK {row.household_number} · {row.rt_code}
                  <br />Mendaftar: {row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID') : '-'} · Google: {row.google_connected ? 'Terhubung' : 'Belum terhubung'}
                  {row.verification_note ? <><br /><strong>Catatan:</strong> {row.verification_note}</> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Link className="btn btn-ghost" to={`/admin/warga/${row.citizen_id}`}><ClipboardCheck size={15} /> Lihat data</Link>
                <button className="btn btn-primary" disabled={busyId === row.citizen_id} onClick={() => openVerify(row)}><ShieldCheck size={15} /> Verifikasi</button>
                <button className="btn btn-ghost" disabled={busyId === row.citizen_id} onClick={() => { setAction({ citizenId: row.citizen_id, mode: 'correction' }); setNote('') }}>Minta Perbaikan</button>
                <button className="btn btn-danger" disabled={busyId === row.citizen_id} onClick={() => { setAction({ citizenId: row.citizen_id, mode: 'reject' }); setNote('') }}><XCircle size={15} /> Tolak</button>
              </div>
            </div>

            {action?.citizenId === row.citizen_id && (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={action.mode === 'reject' ? 'Alasan penolakan (wajib)...' : 'Catatan perbaikan untuk warga (wajib)...'}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" disabled={!note.trim() || busyId === row.citizen_id} onClick={() => void submitAction()}>
                    {action.mode === 'reject' ? 'Kirim Penolakan' : 'Kirim Permintaan Perbaikan'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setAction(null); setNote('') }}>Batal</button>
                </div>
              </div>
            )}
          </section>
        ))
      )}
    </div>
    <VerificationModal
      open={Boolean(verifyRow)}
      citizen={verifyRow}
      busy={verifyBusy}
      error={verifyError}
      onClose={() => { if (!verifyBusy) { setVerifyRow(null); setVerifyError('') } }}
      onConfirm={() => void confirmVerify()}
    />
    </div>
  )
}
