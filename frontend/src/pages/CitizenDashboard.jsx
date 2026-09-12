import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, CalendarDays, HeartPulse, Phone, Scale, Siren, UserRound, Heart, Sparkles } from 'lucide-react'
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

function getBpStatus(s, d) {
  if (s == null || d == null) return { label: 'Belum ada', tone: 'muted' }
  if (s >= 140 || d >= 90) return { label: 'Perlu perhatian', tone: 'warn' }
  if (s < 90 || d < 60) return { label: 'Rendah', tone: 'warn' }
  return { label: 'Normal', tone: 'ok' }
}
function getSugarStatus(v) {
  if (v == null) return { label: 'Belum ada', tone: 'muted' }
  if (v >= 200) return { label: 'Tinggi', tone: 'warn' }
  if (v < 70) return { label: 'Rendah', tone: 'warn' }
  return { label: 'Normal', tone: 'ok' }
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
  const firstName = name.split(' ')[0]
  const latestBy = (predicate) => records.find(predicate) ?? null

  const bpRecord = latestBy((r) => num(r.systolic) != null)
  const sugarRecord = latestBy((r) => num(r.sugar) != null)
  const weightRecord = latestBy((r) => num(r.weight_kg) != null)

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

  const bpStatus = getBpStatus(bpRecord ? num(bpRecord.systolic) : null, bpRecord ? num(bpRecord.diastolic) : null)
  const sugarStatus = getSugarStatus(sugarRecord ? num(sugarRecord.sugar) : null)
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

  const insightText = (() => {
    if (!isSupabaseConfigured || records.length === 0) return 'Pantau kesehatan secara rutin dan jangan abaikan perubahan kecil pada tubuh Anda.'
    if (bpStatus.tone === 'warn') return 'Tekanan darah terakhir sedikit di luar rentang normal. Cobalah kurangi garam, cukup tidur, dan konsultasi saat pemeriksaan berikutnya.'
    if (sugarStatus.tone === 'warn') return 'Gula darah terakhir perlu diperhatikan. Jaga pola makan seimbang dan lakukan pemeriksaan ulang sesuai anjuran nakes.'
    return 'Tekanan darah Anda berada dalam rentang normal. Pertahankan pola hidup sehat dan cek berkala.'
  })()

  return <div className="warga-dashboard"><div className="container">
    <div className="warga-greeting">
      <div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 }}>{today}</p>
        <h1 className="display">Halo, {firstName} 👋</h1>
        <p>Jaga kesehatan, jaga masa depan.</p>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="warga-greeting-sub"><span style={{ width: 8, height: 8, borderRadius: 50, background: '#16a34a', display: 'inline-block' }} /> Online</span>
        <Link to="/warga/notifikasi" aria-label="Notifikasi" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'white', border: '1px solid var(--line)', borderRadius: 12 }}><Bell size={18} color="var(--muted)" /></Link>
      </div>
    </div>

    {!linked && isSupabaseConfigured && (
      <div className="staff-alert" style={{ marginBottom: 16 }}>
        <span>Akun Google Anda belum terhubung ke profil warga. Lengkapi data di halaman pendaftaran atau hubungi petugas desa.</span>
      </div>
    )}
    {linked && ['pending', 'pending_verification'].includes(profile?.verification_status) && (
      <div className="staff-alert" role="status" style={{ marginBottom: 16, background: '#fff8e7', borderColor: '#fde68a', color: '#92400e' }}>
        ⏳ <span>Menunggu verifikasi admin — QR Kesehatan akan aktif setelah diverifikasi.</span>
      </div>
    )}

    <div className="warga-metrics">
      <div className="warga-metric-card card-reveal" style={{ animationDelay: '0ms' }}>
        <div className="warga-metric-top"><span className="warga-metric-icon"><HeartPulse size={18} /></span><span className={`warga-metric-status ${bpStatus.tone}`}>{bpStatus.label}</span></div>
        <small>Tekanan Darah</small><strong>{loading ? '…' : metrics.bp ?? '—'}</strong><small style={{ marginTop: 2, fontWeight: 700, color: 'var(--ink)' }}>{metrics.bp ? metrics.bpUnit : ''}</small><span>Terakhir diperiksa {bpRecord ? new Date(bpRecord.examined_at).toLocaleDateString('id-ID') : demoHealth.bloodPressure.date}</span>
      </div>
      <div className="warga-metric-card card-reveal" style={{ animationDelay: '80ms' }}>
        <div className="warga-metric-top"><span className="warga-metric-icon" style={{ background: '#fef3c7', color: '#92400e' }}><Activity size={18} /></span><span className={`warga-metric-status ${sugarStatus.tone}`}>{sugarStatus.label}</span></div>
        <small>Gula Darah</small><strong>{loading ? '…' : metrics.sugar ?? '—'}</strong><small style={{ marginTop: 2, fontWeight: 700, color: 'var(--ink)' }}>{metrics.sugar ? metrics.sugarUnit : ''}</small><span>Terakhir diperiksa {sugarRecord ? new Date(sugarRecord.examined_at).toLocaleDateString('id-ID') : demoHealth.bloodSugar.date}</span>
      </div>
      <div className="warga-metric-card card-reveal" style={{ animationDelay: '160ms' }}>
        <div className="warga-metric-top"><span className="warga-metric-icon" style={{ background: '#f0fdf4', color: '#15803d' }}><Scale size={18} /></span><span className="warga-metric-status ok">Stabil</span></div>
        <small>Berat Badan</small><strong>{loading ? '…' : metrics.weight ?? '—'}</strong><small style={{ marginTop: 2, fontWeight: 700, color: 'var(--ink)' }}>{metrics.weight ? metrics.weightUnit : ''}</small><span>Terakhir diperiksa {weightRecord ? new Date(weightRecord.examined_at).toLocaleDateString('id-ID') : demoHealth.weight.date}</span>
      </div>
      <div className="warga-metric-card card-reveal" style={{ animationDelay: '240ms' }}>
        <div className="warga-metric-top"><span className="warga-metric-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Heart size={18} /></span><span className="warga-metric-status muted">Info</span></div>
        <small>Golongan Darah</small><strong>{metrics.bloodType ?? '—'}</strong><small style={{ marginTop: 2, fontWeight: 700, color: 'var(--ink)' }}>Golongan darah</small><span>Data profil • {profile?.blood_type ? 'Tersimpan' : 'Belum diisi'}</span>
      </div>
    </div>

    <div className="warga-banner card-reveal">
      <div>
        <h2 className="display">Jaga Kesehatan, Raih Hidup Lebih Baik</h2>
        <p>Pantau kesehatan secara rutin dan jangan abaikan perubahan kecil. Pemeriksaan berkala membantu deteksi dini.</p>
        <Link className="btn" to="/warga/riwayat">Lihat Riwayat <ArrowRight size={16} /></Link>
      </div>
      <div className="warga-banner-visual" aria-hidden="true">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: 'white', display: 'grid', placeItems: 'center', color: 'var(--teal)' }}><HeartPulse size={26} /></span>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', color: '#ea580c' }}><UserRound size={20} /></span>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', color: '#16a34a' }}><Sparkles size={20} /></span>
        </div>
        <small style={{ marginTop: 8, color: 'white', opacity: .9, fontWeight: 600, fontSize: 11 }}>Ilustrasi komunitas sehat — Desa Sehat Kenanga</small>
      </div>
    </div>

    <div className="warga-bottom">
      <section className="warga-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><h3>Aktivitas Terbaru</h3><Link to="/warga/riwayat" style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 800 }}>Lihat semua</Link></div>
        {loading ? <p className="muted-text">Memuat riwayat...</p> : recent.length === 0 ? <p className="muted-text">Belum ada riwayat pemeriksaan.</p> : (
          <div className="timeline">{recent.map((item, i) => <div className="timeline-item" key={i}><div className="timeline-dot"><HeartPulse size={15} /></div><div><strong style={{ fontSize: 13 }}>{item.title}</strong><span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.value} • {item.date}</span><span style={{ fontSize: 11, color: 'var(--muted)' }}>Pemeriksa: {item.examiner}</span></div></div>)}</div>
        )}
      </section>
      <section className="warga-panel" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={16} color="#16a34a" /> Ringkasan Kesehatan</h3>
        <p style={{ margin: 0, color: '#36593d', fontSize: 13.5, lineHeight: 1.6 }}>{insightText}</p>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-soft" to="/warga/kesehatan" style={{ fontSize: 12 }}>Pantau kesehatan</Link>
          <Link className="btn btn-ghost" to="/informasi-kesehatan" style={{ fontSize: 12 }}><BookOpen size={14} /> Info sehat</Link>
        </div>
      </section>
    </div>

    <div className="dashboard-columns" style={{ marginTop: 16 }}><section className="panel"><div className="panel-header"><h2>Apa yang ingin dilakukan?</h2><CalendarDays size={19} color="var(--muted)" /></div><div className="action-list"><Link className="action-card" to="/warga/qr-kesehatan"><span className="icon-tile">🪪</span><span>QR Saya <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/kesehatan"><span className="icon-tile"><Activity size={19} /></span><span>Pantau kesehatan <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/ai-kesehatan"><span className="icon-tile"><Sparkles size={16} /></span><span>AI Kesehatan <ArrowRight size={14} /></span></Link><Link className="action-card" to="/warga/riwayat"><span className="icon-tile"><CalendarDays size={19} /></span><span>Lihat riwayat <ArrowRight size={14} /></span></Link></div></section><section className="emergency-panel"><Siren size={22} color="#b42318" /><h2>Bantuan darurat</h2><p>Jika kondisi terasa gawat, segera hubungi petugas.</p><Link className="btn btn-danger btn-wide" to="/warga/bantuan"><Phone size={17} /> Hubungi petugas</Link></section></div>
  </div></div>
}
