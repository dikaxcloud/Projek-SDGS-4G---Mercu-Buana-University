import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, AlertTriangle, RefreshCw, History, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getMyExaminations, getExaminationDetail } from '../features/health/healthService'
import { supabase } from '../lib/supabase'

function summarize(row) {
  const parts = []
  if (row.systolic != null) parts.push(`${row.systolic}/${row.diastolic} mmHg`)
  if (row.sugar != null) parts.push(`${Number(row.sugar)} mg/dL`)
  if (row.weight_kg != null) parts.push(`${Number(row.weight_kg)} kg`)
  if (row.temperature_c != null) parts.push(`${Number(row.temperature_c)} °C`)
  if (row.pulse_bpm != null) parts.push(`${row.pulse_bpm} BPM`)
  return parts.length ? parts.join(' · ') : 'Pemeriksaan umum'
}

function groupByDate(rows) {
  const map = new Map()
  for (const r of rows) {
    const d = new Date(r.examined_at)
    const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  // sort tanggal desc (hari ini paling atas)
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

export function MyExaminationsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); getMyExaminations(50).then(setRows).catch((err) => setError(err.message || 'Riwayat belum dapat dimuat.')).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])

  // realtime dari tabel health_records — per tanggal update otomatis
  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('my-examinations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_records' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const grouped = useMemo(() => {
    const g = groupByDate(rows)
    const todayKey = new Date().toISOString().slice(0, 10)
    const hasToday = g.some(([k]) => k === todayKey)
    if (!hasToday) {
      // tampilkan hari ini walau kosong — sesuai request "kalau engga ada data hari ini ya kosong"
      return [[todayKey, []], ...g]
    }
    return g
  }, [rows])

  return <div className="staff-page"><div className="container narrow-container">
    <Link className="back-link" to="/nakes"><ArrowLeft size={15} /> Kembali</Link>
    <div className="form-heading"><div className="icon-tile"><History size={21} /></div><div><div className="eyebrow">Portal nakes</div><h1 className="display">Riwayat Pemeriksaan Saya</h1></div></div>
    <p className="page-intro">Realtime dari tabel <code>health_records</code> — dikelompokkan per tanggal. Hari ini {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    {error && <div className="staff-alert"><AlertTriangle size={17} /> {error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}
    {loading ? <p className="muted-text">Memuat riwayat...</p> : rows.length === 0 ? (
      <div className="staff-panel"><p className="muted-text">Anda belum mencatat pemeriksaan apa pun.</p><Link to="/nakes/pemeriksaan/baru" style={{ color: 'var(--teal)', fontWeight: 800 }}>Mulai pemeriksaan pertama →</Link></div>
    ) : (
      <div style={{ display: 'grid', gap: 18 }}>
        {grouped.map(([dateKey, list]) => {
          const d = new Date(dateKey + 'T12:00:00')
          const label = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          const isToday = new Date().toISOString().slice(0, 10) === dateKey
          return (
            <section key={dateKey} className="staff-panel" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                <CalendarDays size={16} />
                <strong style={{ fontSize: 14 }}>{label}</strong>
                <span style={{ marginLeft: 'auto', background: isToday ? 'var(--teal)' : '#f3f4f6', color: isToday ? '#fff' : 'var(--muted)', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{list.length} pemeriksaan</span>
                {isToday && list.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>— Kosong</span>}
              </div>
              {list.length === 0 ? (
                <p className="muted-text" style={{ margin: 0, padding: '8px 0', textAlign: 'center' }}>Belum ada pemeriksaan pada tanggal ini — Kosong.</p>
              ) : (
                <div className="record-table">{list.map((row) => <ExaminationRow key={row.health_record_id} row={row} />)}</div>
              )}
            </section>
          )
        })}
      </div>
    )}
  </div></div>
}

function ExaminationRow({ row }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const toggle = async () => {
    if (detailOpen) return setDetailOpen(false)
    try { if (!detail) setDetail(await getExaminationDetail(row.health_record_id)) } catch { /* keep summary */ }
    setDetailOpen(true)
  }
  return (
    <div className="record-row" style={{ flexWrap: 'wrap' }}>
      <button type="button" onClick={() => void toggle()} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
        <div style={{ minWidth: 0 }}>
          <strong>{row.citizen_name}</strong>
          <small>{new Date(row.examined_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · RT {String(row.rt_code || '').replace('RT ', '')}</small>
          <small style={{ display: 'block' }}>{summarize(row)}{row.needs_follow_up ? ' · ⚠ Perlu diperiksa kembali' : ''}</small>
        </div>
      </button>
      {detailOpen && (
        <div style={{ width: '100%', background: '#f9fbfa', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginTop: 10 }}>
          {!detail ? <p className="muted-text" style={{ margin: 0 }}>Detail tidak tersedia.</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, fontSize: 13 }}>
                <span>Tensi: <strong>{detail.metrics?.systolic ?? '—'}/{detail.metrics?.diastolic ?? '—'} mmHg</strong></span>
                <span>Gula darah: <strong>{detail.metrics?.sugar ? Number(detail.metrics.sugar) + ' mg/dL' : '—'}</strong>{detail.metrics?.sugar_context ? ` (${detail.metrics.sugar_context})` : ''}</span>
                <span>Berat: <strong>{detail.metrics?.weight_kg ? Number(detail.metrics.weight_kg) + ' kg' : '—'}</strong></span>
                <span>Tinggi: <strong>{detail.metrics?.height_cm ? Number(detail.metrics.height_cm) + ' cm' : '—'}</strong></span>
                <span>Suhu: <strong>{detail.metrics?.temperature_c ? Number(detail.metrics.temperature_c) + ' °C' : '—'}</strong></span>
                <span>Nadi: <strong>{detail.metrics?.pulse_bpm ? detail.metrics.pulse_bpm + ' BPM' : '—'}</strong></span>
              </div>
              {detail.complaint && <p style={{ margin: '8px 0 0', fontSize: 13 }}><strong>Keluhan:</strong> {detail.complaint}</p>}
              {detail.notes && <p style={{ margin: '4px 0 0', fontSize: 13 }}><strong>Catatan:</strong> {detail.notes}</p>}
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>Diperiksa oleh: {detail.examiner_name} · Warga: <Link to={`/nakes/warga/${detail.citizen.citizen_id}`} style={{ color: 'var(--teal)', fontWeight: 700 }}>{detail.citizen.full_name}</Link> (lihat riwayat & tren warga)</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
