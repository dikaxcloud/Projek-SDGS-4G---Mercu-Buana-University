import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CalendarClock, ChevronRight, Home, Map, RefreshCw, ShieldCheck, UserX, UserCheck, Users, UserRoundCog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAdminSummary } from '../features/admin/adminService'
import { listStaffCitizens } from '../features/staff/staffService'

export function AdminDashboard() {
  const [summary, setSummary] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [pendingCount, setPendingCount] = useState(0)
  const load = async () => {
    setLoading(true); setError('')
    try {
      setSummary(await getAdminSummary())
      try {
        const pending = await listStaffCitizens({ status: 'pending_verification', limit: 100 })
        setPendingCount((pending ?? []).length)
      } catch { /* non-fatal */ }
    } catch (err) { setError(err.message || 'Ringkasan admin belum dapat dimuat.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  return <div className="admin-page"><div className="container"><div className="staff-header"><div><div className="eyebrow">Portal administrasi desa</div><h1 className="display">Ringkasan desa</h1><p>Kelola data layanan kesehatan dengan jejak perubahan yang jelas.</p></div><Link className="btn btn-primary" to="/admin/verifikasi"><ShieldCheck size={17} /> Verifikasi Warga{pendingCount > 0 ? ` (${pendingCount})` : ''}</Link></div>
    {error && <div className="staff-alert"><AlertTriangle size={17} /> {error}<button className="btn btn-ghost" onClick={load}><RefreshCw size={15} /> Coba lagi</button></div>}
    {pendingCount > 0 && (
      <Link to="/admin/verifikasi" style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 16 }}>
        <div className="staff-alert" style={{ background: '#fff8e7', borderColor: '#fde68a', color: '#92400e', cursor: 'pointer', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><ShieldCheck size={18} /> <strong>{pendingCount} pendaftaran warga</strong>&nbsp;menunggu verifikasi Anda</span>
          <ChevronRight size={18} />
        </div>
      </Link>
    )}
    <section className="admin-primary-metrics"><div className="admin-section-heading"><span>Data desa</span><h2>Ringkasan utama</h2></div><div className="admin-kpis"><Kpi icon={<Users />} label="Total warga" value={summary?.totalCitizens ?? (loading ? '…' : '—')} /><Kpi icon={<Home />} label="Total KK" value={summary?.totalHouseholds ?? (loading ? '…' : '—')} /><Kpi icon={<Map />} label="Total RT" value={summary?.totalRts ?? (loading ? '…' : '—')} /><Kpi icon={<UserRoundCog />} label="Total nakes" value={summary?.totalHealthWorkers ?? (loading ? '…' : '—')} /></div></section><section className="admin-activity-overview"><div className="admin-section-heading"><span>Aktivitas layanan</span><h2>Activity overview</h2></div><div className="admin-kpis admin-activity-kpis"><Kpi icon={<Activity />} label="Pemeriksaan hari ini" value={summary?.todayExaminations ?? (loading ? '…' : '—')} />
    <Kpi icon={<CalendarClock />} label="Pemeriksaan minggu ini" value={summary?.weekExaminations ?? (loading ? '…' : '—')} /><Kpi icon={<UserX />} label="Warga belum diperiksa" value={summary?.neverExaminedCitizens ?? (loading ? '…' : '—')} /><Kpi icon={<UserCheck />} label="Warga baru minggu ini" value={summary?.newCitizensThisWeek ?? (loading ? '…' : '—')} /></div></section><section className="admin-panel"><div className="staff-panel-head"><div><h2>Distribusi KK per RT</h2><p>Satu batang menunjukkan jumlah KK pada setiap RT.</p></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary?.rtDistribution ?? []} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#6b8582', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#6b8582', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#eff9f6' }} contentStyle={{ border: '1px solid #e3eeeb', borderRadius: 12, fontSize: 12 }} /><Bar dataKey="total" name="Jumlah KK" fill="#0f766e" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-summary">{(summary?.rtDistribution ?? []).map((item) => <span key={item.label}><strong>{item.total}</strong> KK · {item.label}</span>)}</div></section><section className="admin-panel"><div className="staff-panel-head"><div><h2>Pemeriksaan terbaru</h2><p>Aktivitas pemeriksaan terkini seluruh desa.</p></div></div>{(summary?.recentExaminations ?? []).length === 0 ? <p className="muted-text">Belum ada data.</p> : <div className="record-table">{summary.recentExaminations.map((item) => <div className="record-row" key={item.health_record_id}><div><strong>{item.citizen_name}</strong><small>{new Date(item.examined_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · oleh {item.examiner}</small></div><span>{item.summary}</span></div>)}</div>}</section></div></div>
}
function Kpi({ icon, label, value }) { return <div className="admin-kpi"><span className="staff-kpi-icon">{icon}</span><small>{label}</small><strong>{value}</strong></div> }
