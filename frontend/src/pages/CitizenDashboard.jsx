import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, CalendarDays, HeartPulse, Phone, Scale, Siren, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { getCitizenContext } from '../features/citizen/citizenService'
import { getMyHealthHistory } from '../features/health/healthService'
import { isSupabaseConfigured } from '../lib/supabase'
import { demoHealth, demoTimeline } from '../services/demoData'

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function CitizenDashboard() {
  const { access } = useAuth()
  const [profile, setProfile] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const linked = Boolean(access?.citizen_id)

  useEffect(() => {
    let active = true
    setLoading(true)
    void getCitizenContext().then((context) => { if (active) setProfile(context.profile) }).catch(() => {})
    if (!linked && isSupabaseConfigured) {
      // Real account without a connected citizen profile yet.
      if (active) { setRecords([]); setLoading(false) }
      return () => { active = false }
    }
    if (isSupabaseConfigured) {
      getMyHealthHistory(8)
        .then((rows) => { if (active) setRecords(rows ?? []) })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false) })
    } else {
      setRecords(demoTimeline.map((item, index) => ({ health_record_id: `demo-${index}`, examined_at: new Date(2026, 7, 23 - index * 3).toISOString(), ...item })))
      setLoading(false)
    }
    return () => { active = false }
  }, [linked])

  const name = profile?.full_name || access?.display_name || 'Warga'
  const latestBy = (predicate) => records.find(predicate) ?? null

  const bpRecord = latestBy((r) => num(r.systolic) != null)
  const sugarRecord = latestBy((r) => num(r.sugar) != null)
  const weightRecord = latestBy((r) => num(r.weight_kg) != null)

  // Production shows real values only; demo mode keeps sample numbers.
  const metrics = isSupabaseConfigured
    ? {
        bp: bpRecord ? `${num(bpRecord.systolic)}/${num(bpRecord.diastolic)}` : null,
        bpUnit: 'mmHg',
        sugar: sugarRecord ? `${num(sugarRecord.sugar)}` : null,
        sugarUnit: `mg/dL${sugarRecord?.sugar_context ? ` · ${sugarRecord.sugar_context}` : ''}`,
        weight: weightRecord ? `${num(weightRecord.weight_kg)}` : null,
        weightUnit: 'kg',
        bloodType: profile?.blood_type ?? null,
      }
    : {
        bp: demoHealth.bloodPressure.value, bpUnit: demoHealth.bloodPressure.unit,
        sugar: demoHealth.bloodSugar.value, sugarUnit: demoHealth.bloodSugar.unit,
        weight: demoHealth.weight.value, weightUnit: demoHealth.weight.unit,
        bloodType: profile?.blood_type || demoHealth.bloodType.value,
      }

  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const recent = isSupabaseConfigured
    ? records.slice(0, 4).map((record) => ({
        title: [
          record.systolic != null ? 'Tekanan Darah' : null,
          record.sugar != null ? 'Gula Darah' : null,
          record.weight_kg != null ? 'Berat Badan' : null,
          record.temperature_c != null ? 'Suhu' : null,
        ].filter(Boolean).join(' · ') || 'Pemeriksaan',
        value: [
          record.systolic != null ? `${record.systolic}/${record.diastolic} mmHg` : null,
          record.sugar != null ? `${record.sugar} mg/dL` : null,
          record.weight_kg != null ? `${record.weight_kg} kg` : null,
        ].filter(Boolean).join(' · '),
        date: new Date(record.examined_at).toLocaleDateString('id-ID'),
        examiner: record.examiner_name || 'Nakes Desa',
      }))
    : records.map((item) => ({ title: item.title, value: item.value, date: item.date, examiner: item.examiner }))

  return <div className="dashboard-page"><div className="container">
    <div className="dashboard-header"><div><p>{today}</p><h1 className="display">Halo, {name} 👋</h1></div><div className="btn btn-soft"><Activity size={17} /> Online</div></div>

    {!linked && isSupabaseConfigured && (
      <div className="staff-alert" style={{ marginBottom: 16 }}>
        <span>Akun Google Anda belum terhubung ke profil warga. Login Google lalu lengkapi data di halaman pendaftaran, atau hubungi petugas desa untuk kode aktivasi.</span>
      </div>
    )}
    {linked && ['pending', 'pending_verification'].includes(profile?.verification_status) && (
      <div className="staff-alert" role="status" style={{ marginBottom: 16, background: '#fff8e7', borderColor: '#fde68a', color: '#92400e' }}>
        ⏳ <span>Data Anda sedang <strong>menunggu verifikasi admin</strong>. QR Kesehatan akan aktif otomatis setelah diverifikasi.</span>
      </div>
    )}
    {linked && profile?.verification_status === 'rejected' && (
      <div className="staff-alert" role="alert" style={{ marginBottom: 16, background: '#fef2f2', borderColor: '#fecaca', color: '#b42318' }}>
        ❌ <span>Pendaftaran Anda ditolak{profile?.verification_note ? <> — Alasan: <strong>{profile.verification_note}</strong></> : null}. Silakan hubungi petugas desa untuk perbaikan data.</span>
      </div>
    )}

    <div className="dashboard-grid">
      <Metric icon={<HeartPulse size={19} />} label="Tekanan darah" value={metrics.bp ?? (loading ? '…' : 'Belum ada data')} unit={metrics.bp ?? loading ? metrics.bpUnit : ''} />
      <Metric icon={<Activity size={19} />} label="Gula darah" value={metrics.sugar ?? (loading ? '…' : 'Belum ada data')} unit={metrics.sugar ? metrics.sugarUnit : ''} />
      <Metric icon={<Scale size={19} />} label="Berat badan" value={metrics.weight ?? (loading ? '…' : 'Belum ada data')} unit={metrics.weight ? metrics.weightUnit : ''} />
      <Metric icon={<HeartPulse size={19} />} label="Golongan darah" value={metrics.bloodType ?? '—'} unit={metrics.bloodType ? 'Golongan darah' : ''} />
    </div>
    <div className="dashboard-columns"><section className="panel"><div className="panel-header"><h2>Apa yang ingin dilakukan?</h2><CalendarDays size={19} color="var(--muted)" /></div><div className="action-list"><Link className="action-card" to="/warga/qr-kesehatan"><span className="icon-tile">🪪</span><span>QR Saya <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/kesehatan"><span className="icon-tile"><Activity size={19} /></span><span>Pantau kesehatan <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/ai-kesehatan"><span className="icon-tile"><SparkleIcon /></span><span>AI Kesehatan <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/riwayat"><span className="icon-tile"><CalendarDays size={19} /></span><span>Lihat riwayat <ArrowRight size={14} /></span></Link></div></section><section className="emergency-panel"><Siren size={22} color="#b42318" /><h2>Bantuan darurat</h2><p>Jika kondisi terasa gawat, segera hubungi petugas atau layanan darurat setempat.</p><Link className="btn btn-danger btn-wide" to="/warga/bantuan"><Phone size={17} /> Hubungi petugas</Link></section></div>
    <div className="dashboard-columns"><section className="panel"><div className="panel-header"><h2>Riwayat terbaru</h2><Link to="/warga/riwayat" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 800 }}>Semua</Link></div>
      {loading ? <p className="muted-text">Memuat riwayat...</p> : recent.length === 0 ? <p className="muted-text">Belum ada riwayat pemeriksaan. Lakukan pemeriksaan pertama bersama petugas desa.</p> : (
        <div className="timeline">{recent.map((item, index) => <div className="timeline-item" key={`${item.title}-${index}`}><div className="timeline-dot"><HeartPulse size={17} /></div><div><strong>{item.title}</strong><span>{[item.value].filter(Boolean).join(' · ')} · {item.date}</span><span>Pemeriksa: {item.examiner}</span></div></div>)}</div>
      )}
    </section><section className="panel"><div className="panel-header"><h2>Catatan hari ini</h2><Bell size={18} color="var(--muted)" /></div><div style={{ padding: 16, borderRadius: 16, background: '#f0fbf7', color: 'var(--teal-dark)', fontSize: 14, lineHeight: 1.55 }}>Tidak ada pesan baru. Tetap jaga pola makan dan minum air putih yang cukup.</div></section></div>
  </div></div>
}
function SparkleIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg> }
function Metric({ icon, label, value, unit }) { return <div className="health-metric"><div className="health-metric-head"><span>{label}</span><span className="icon-tile" style={{ width: 32, height: 32 }}>{icon}</span></div><strong>{value}</strong>{unit ? <span>{unit}</span> : null}</div> }
