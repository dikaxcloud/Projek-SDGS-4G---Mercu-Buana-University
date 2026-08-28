import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, BellRing, ClipboardList, Search, Users, ArrowRight, RefreshCw, Sparkles, UserPlus, CalendarClock, UserCheck, UserX, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getNakesSummary, getNakesDashboard, searchCitizens } from '../features/health/healthService'
import { subscribeToCitizenInserts, subscribeToHealthChanges } from '../lib/realtime'

export function NakesDashboard() {
  const [summary, setSummary] = useState(null)
  const [dash, setDash] = useState(null)
  const [citizens, setCitizens] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveAlert, setLiveAlert] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextSummary, nextCitizens] = await Promise.all([getNakesSummary(), searchCitizens(query)])
      setSummary(nextSummary)
      setCitizens(nextCitizens)
      try { setDash(await getNakesDashboard()) } catch { /* dashboard numbers optional */ }
    } catch (err) { setError(err.message || 'Data belum dapat dimuat.') } finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
    const stopHealth = subscribeToHealthChanges({ onChange: () => void load() })
    const stopCitizens = subscribeToCitizenInserts((citizen) => {
      setLiveAlert({ name: citizen.full_name, at: new Date() })
      void load()
    })
    return () => { stopHealth(); stopCitizens() }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void searchCitizens(query).then(setCitizens).catch(() => setError('Pencarian belum berhasil.')) }, 250); return () => clearTimeout(timer) }, [query])

  const recentExaminations = dash?.recentExaminations ?? []
  const showRecent = recentExaminations.length > 0
  const recentList = showRecent ? (
    <div className="record-table">{recentExaminations.map((item) => (
      <Link className="record-row" key={item.health_record_id} to={`/nakes/pemeriksaan/${item.health_record_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div><strong>{item.citizen_name}</strong><small>{new Date(item.examined_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
        <span>{item.summary}</span>
        <ArrowRight size={15} />
      </Link>
    ))}</div>
  ) : (
    <p className="muted-text">Belum ada pemeriksaan tercatat.</p>
  )

  return (
    <div className="staff-page">
      <div className="container">
        <div className="staff-header">
          <div>
            <div className="eyebrow">Portal tenaga kesehatan</div>
            <h1 className="display">Selamat datang, {dash?.examinerName || 'Nakes'} 👋</h1>
            <p>Pantau warga dan catat pemeriksaan dengan rapi.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn-ghost" to="/nakes/riwayat-saya"><History size={17} /> Riwayat Saya</Link>
            <Link className="btn btn-ghost" to="/nakes/warga/baru"><UserPlus size={17} /> Tambah Warga</Link>
            <Link className="btn btn-primary" to="/nakes/pemeriksaan/baru"><ClipboardList size={17} /> Mulai pemeriksaan</Link>
          </div>
        </div>
        {liveAlert && <div className="staff-alert" role="status" style={{ background: '#f0f7ff', borderColor: '#bfdcff', color: '#1d4ed8' }}><BellRing size={17} /><span><strong>Warga baru masuk:</strong> {liveAlert.name}. Daftar warga diperbarui otomatis ({liveAlert.at.toLocaleTimeString('id-ID')}).</span><button className="btn btn-ghost" onClick={() => setLiveAlert(null)}>Tutup</button></div>}
        {error && <div className="staff-alert"><AlertTriangle size={17} />{error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}

        {/* Angka kerja nyata milik nakes */}
        <div className="staff-kpis">
          <StaffKpi icon={<CalendarClock />} label="Pemeriksaan hari ini (saya)" value={dash?.myExaminationsToday ?? '—'} />
          <StaffKpi icon={<UserCheck />} label="Warga saya periksa hari ini" value={dash?.myCitizensToday ?? '—'} />
          <StaffKpi icon={<Activity />} label="Total pemeriksaan saya" value={dash?.myTotalExaminations ?? '—'} />
          <StaffKpi icon={<AlertTriangle />} label="Perlu diperiksa kembali" value={summary?.followUps ?? dash?.followUps ?? '—'} warning />
        </div>
        <div className="staff-kpis">
          <StaffKpi icon={<Users />} label="Total warga desa" value={summary?.totalCitizens ?? '—'} />
          <StaffKpi icon={<Users />} label="Total KK" value={summary?.totalHouseholds ?? '—'} />
          <StaffKpi icon={<UserX />} label="Warga belum pernah diperiksa" value={dash?.unexaminedCitizens ?? '—'} warning={Number(dash?.unexaminedCitizens) > 0} />
          <StaffKpi icon={<Activity />} label="Pemeriksaan hari ini (desa)" value={summary?.todayExaminations ?? '—'} />
        </div>

        {/* AI Nakes Summary Widget */}
        <section className="staff-panel ai-widget">
          <h2 className="ai-widget-title"><Sparkles size={18} color="#6366f1" /> ✨ AI Health Monitoring Nakes</h2>
          <div className="ai-widget-grid">
            <div>
              <strong>Ringkasan Populasi & Tren:</strong>
              <p className="ai-widget-text">
                Aktivitas pencatatan pemeriksaan stabil. {summary?.followUps ? `${summary.followUps} warga disarankan untuk jadwal tindak lanjut.` : 'Belum ada warga memerlukan penanganan khusus saat ini.'}
              </p>
            </div>
            <div>
              <strong>Saran AI Nakes:</strong>
              <ul className="ai-widget-list">
                <li>{'Prioritaskan lansia dan warga dengan tensi > 140/90 mmHg.'}</li>
                <li>Pastikan edukasi pola makan rendah garam saat kunjungan warga.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Pemeriksaan terbaru milik nakes */}
        <section className="staff-panel">
          <div className="staff-panel-head">
            <div><h2>Pemeriksaan terbaru</h2><p>Klik untuk membuka detail pemeriksaan.</p></div>
            <Link to="/nakes/riwayat-saya" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 800 }}>Riwayat saya <ArrowRight size={13} /></Link>
          </div>
          {recentList}
        </section>

        <div className="staff-columns">
          <section className="staff-panel">
            <div className="staff-panel-head"><div><h2>Pemeriksaan 5 hari terakhir</h2><p>Realtime per hari — reset 00:00 WIB. Hari ini {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p></div></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={summary?.byDay ?? []} margin={{ top: 10, right: 8, left: -18, bottom: 12 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#6b8582', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={36} />
                  <YAxis allowDecimals={false} tick={{ fill: '#6b8582', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#eff9f6' }} contentStyle={{ border: '1px solid #e3eeeb', borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="total" name="Pemeriksaan" fill="#0f766e" radius={[7, 7, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-summary">{(summary?.byDay ?? []).map((item) => <span key={item.label}><strong>{item.total}</strong> {item.label}</span>)}</div>
            <table className="byday-table" style={{ width: '100%', marginTop: 14, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}><th style={{ padding: '6px 0', fontWeight: 700 }}>Hari & Tanggal</th><th style={{ padding: '6px 0', fontWeight: 700, textAlign: 'right' }}>Jumlah</th></tr></thead>
              <tbody>
                {(summary?.byDay ?? []).length === 0 ? (
                  <tr><td colSpan={2} style={{ padding: '12px 0', textAlign: 'center', color: 'var(--muted)' }}>Belum ada data 5 hari terakhir.</td></tr>
                ) : (
                  (summary?.byDay ?? []).map((item) => (
                    <tr key={item.day || item.label} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 0' }}>{item.label}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700 }}>{item.total === 0 ? <span style={{ color: 'var(--muted)', fontWeight: 600 }}>0 — Kosong</span> : item.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="staff-panel">
            <div className="staff-panel-head"><div><h2>Cari warga</h2><p>NIK hanya tampil dalam bentuk terbatas.</p></div><Search size={19} color="var(--muted)" /></div>
            <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, KK, atau RT" aria-label="Cari warga" /></label>
            <div className="citizen-results">
              {loading ? <p className="muted-text">Memuat warga...</p> : citizens.length === 0 ? <p className="muted-text">Warga belum ditemukan.</p> : citizens.slice(0, 5).map((citizen) => (
                <Link className="citizen-result" to={`/nakes/warga/${citizen.citizen_id}`} key={citizen.citizen_id}>
                  <span className="avatar">{citizen.full_name.slice(0, 1)}</span>
                  <span><strong>{citizen.full_name}</strong><small>{citizen.rt_code} · {citizen.household_number} · NIK ****{citizen.nik_last4}</small></span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
            <Link to="/nakes/warga" className="staff-link">Lihat semua warga <ArrowRight size={13} /></Link>
          </section>
        </div>
      </div>
    </div>
  )
}

function StaffKpi({ icon, label, value, warning }) {
  return <div className={`staff-kpi ${warning ? 'warning' : ''}`}><span className="staff-kpi-icon">{icon}</span><small>{label}</small><strong>{value}</strong></div>
}