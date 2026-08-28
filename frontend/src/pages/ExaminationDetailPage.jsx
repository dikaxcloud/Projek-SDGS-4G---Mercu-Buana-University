import { useEffect, useState } from 'react'
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getExaminationDetail } from '../features/health/healthService'

export function ExaminationDetailPage() {
  const { recordId } = useParams()
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true); setError('')
    getExaminationDetail(recordId).then(setDetail).catch((err) => setError(err.message || 'Pemeriksaan tidak ditemukan.')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [recordId])

  const m = detail?.metrics ?? {}
  const rows = [
    ['Tekanan darah', m.systolic != null ? `${m.systolic}/${m.diastolic} mmHg` : null],
    ['Gula darah', m.sugar != null ? `${Number(m.sugar)} mg/dL${m.sugar_context ? ` (${m.sugar_context})` : ''}` : null],
    ['Berat badan', m.weight_kg != null ? `${Number(m.weight_kg)} kg` : null],
    ['Tinggi badan', m.height_cm != null ? `${Number(m.height_cm)} cm` : null],
    ['Suhu tubuh', m.temperature_c != null ? `${Number(m.temperature_c)} °C` : null],
    ['Denyut nadi', m.pulse_bpm != null ? `${m.pulse_bpm} BPM` : null],
  ]

  return <div className="staff-page"><div className="container narrow-container">
    <Link className="back-link" to="/nakes/riwayat-saya"><ArrowLeft size={15} /> Kembali ke riwayat</Link>
    <div className="form-heading"><div className="icon-tile">🩺</div><div><div className="eyebrow">Detail pemeriksaan</div><h1 className="display">{detail ? detail.citizen.full_name : 'Pemeriksaan'}</h1></div></div>
    {error && <div className="staff-alert"><AlertTriangle size={17} /> {error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}
    {loading && <p className="muted-text">Memuat detail...</p>}
    {detail && <>
      <p className="page-intro">{new Date(detail.examined_at).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <section className="staff-panel" style={{ marginBottom: 14 }}>
        <div className="staff-panel-head"><div><h2>Data warga</h2></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: 14 }}>
          <span>Nama: <strong>{detail.citizen.full_name}</strong></span>
          <span>NIK: ****{detail.citizen.nik_last4}</span>
          <span>{detail.citizen.rt_code} · {detail.citizen.household_number}</span>
        </div>
        {detail.complaint && <p style={{ marginTop: 10, fontSize: 14 }}><strong>Keluhan:</strong> {detail.complaint}</p>}
        {detail.notes && <p style={{ marginTop: 6, fontSize: 14 }}><strong>Catatan:</strong> {detail.notes}</p>}
      </section>
      <section className="staff-panel" style={{ marginBottom: 14 }}>
        <div className="staff-panel-head"><div><h2>Hasil pemeriksaan</h2><p>Diperiksa oleh: {detail.examiner_name}</p></div></div>
        <div className="record-table">
          {rows.map(([label, value]) => value != null && (
            <div className="record-row" key={label}><strong style={{ minWidth: 140 }}>{label}</strong><span>{value}</span></div>
          ))}
          {rows.every(([, v]) => v == null) && <p className="muted-text">Tidak ada hasil pengukuran pada pemeriksaan ini.</p>}
        </div>
        {detail.needs_follow_up && <p style={{ margin: '10px 0 0', color: '#b42318', fontWeight: 700 }}>⚠ Warga perlu diperiksa kembali.</p>}
      </section>
      <Link className="btn btn-ghost" to={`/nakes/warga/${detail.citizen.citizen_id}`}>Lihat riwayat & tren warga ini →</Link>
    </>}
  </div></div>
}
