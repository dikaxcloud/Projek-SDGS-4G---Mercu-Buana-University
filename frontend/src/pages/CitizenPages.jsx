import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Bell, CheckCircle2, Edit3, HeartPulse, Info, Phone, Save, ShieldCheck, UserRound, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoHealth, demoTimeline } from '../services/demoData'
import { getEmergencyContacts } from '../features/emergency/emergencyService'
import { getCitizenContext, getCitizenNotifications, markCitizenNotificationRead, updateCitizenProfile } from '../features/citizen/citizenService'
import { useAuth } from '../features/auth/AuthProvider'
import { getMyHealthHistory } from '../features/health/healthService'
import { subscribeToHealthChanges, subscribeToNotifications } from '../lib/realtime'
import { analyzeHealthRecord } from '../services/ai/aiService'
import { isSupabaseConfigured } from '../lib/supabase'

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function fmtDate(value) {
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function CitizenHealthPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState(null)

  const load = async () => {
    try {
      const res = isSupabaseConfigured ? await getMyHealthHistory(20) : demoTimeline.map((item, index) => ({
        health_record_id: `demo-${index}`, examined_at: new Date(2026, 7, 23 - index * 3).toISOString(),
        systolic: index === 0 ? 120 : 118, diastolic: index === 0 ? 80 : 78,
        sugar: index === 0 ? 105 : null, weight_kg: index === 0 ? 68 : null,
        temperature_c: index === 0 ? 36.7 : null, pulse_bpm: index === 0 ? 76 : null,
        examiner_name: item.examiner,
      }))
      setRecords(res ?? [])
      if (res && res.length > 0) {
        const first = res[0]
        const aiRes = await analyzeHealthRecord({
          systolic: num(first.systolic), diastolic: num(first.diastolic),
          sugar: num(first.sugar), sugarContext: first.sugar_context,
          weight: num(first.weight_kg), height: num(first.height_cm),
          temperature: num(first.temperature_c), pulse: num(first.pulse_bpm),
          examinedAt: first.examined_at,
        }, {})
        setAiAnalysis(aiRes)
      }
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load(); return subscribeToHealthChanges({ onChange: () => void load() }) }, [])

  const latest = (key) => records.find((record) => num(record[key]) != null)
  const bp = latest('systolic')
  const sugar = latest('sugar')
  const weight = latest('weight_kg')
  const temp = latest('temperature_c')
  // Article cross-links based on what was measured (Phase: AI + Article)
  const learnLinks = []
  if (bp && (num(bp.systolic) >= 120 || num(bp.diastolic) >= 80)) {
    learnLinks.push({ slug: 'memahami-tekanan-darah', label: 'Pelajari tentang tekanan darah' })
    learnLinks.push({ slug: 'menjaga-tekanan-darah', label: 'Cara menjaga tekanan darah' })
  }
  if (sugar && num(sugar.sugar) >= 100) {
    learnLinks.push({ slug: 'mengenal-gula-darah', label: 'Pelajari tentang gula darah' })
  }

  const bpRows = records.filter((r) => num(r.systolic) != null).slice(0, 4).map((r) => `${r.systolic}/${r.diastolic} mmHg · ${fmtDate(r.examined_at)}`)
  const sugarRows = records.filter((r) => num(r.sugar) != null).slice(0, 4).map((r) => `${num(r.sugar)} mg/dL${r.sugar_context ? ` · ${r.sugar_context}` : ''} · ${fmtDate(r.examined_at)}`)
  const weightRows = records.filter((r) => num(r.weight_kg) != null).slice(0, 4).map((r) => `${num(r.weight_kg)} kg · ${fmtDate(r.examined_at)}`)
  const vitalRows = records.filter((r) => num(r.temperature_c) != null || num(r.pulse_bpm) != null).slice(0, 4).map((r) => `${[r.temperature_c != null ? `${num(r.temperature_c)} °C` : null, r.pulse_bpm != null ? `${num(r.pulse_bpm)} BPM` : null].filter(Boolean).join(' · ')} · ${fmtDate(r.examined_at)}`)

  return <CitizenPanel title="Pantau kesehatan" intro="Ringkasan data pemeriksaan Anda, bukan diagnosis.">
    {loading && <p className="muted-text">Memuat data...</p>}
    {!loading && records.length === 0 && <p className="muted-text">Belum ada pemeriksaan. Lakukan pemeriksaan pertama bersama petugas desa.</p>}
    {aiAnalysis && (
      <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #6366f1', padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'rgba(99, 102, 241, 0.05)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0', fontSize: '1rem' }}><Sparkles size={18} color="#6366f1" /> ✨ Analisis AI Kesehatan Terbaru</h3>
        <span className={`badge ${aiAnalysis.statusUi?.color || ''}`}>{aiAnalysis.statusUi?.label}</span>
        <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>{aiAnalysis.summary}</p>
        {learnLinks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {learnLinks.map((item) => (
              <Link key={item.slug} to={`/artikel/${item.slug}`} className="btn btn-soft" style={{ minHeight: 38, fontSize: 12.5 }}>
                📚 {item.label}
              </Link>
            ))}
          </div>
        )}
        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{aiAnalysis.disclaimer}</div>
      </div>
    )}
    {!loading && records.length > 0 && (
      <div className="health-history-grid">
        <HealthPanel title="Tekanan darah" value={bp ? `${bp.systolic}/${bp.diastolic}` : '—'} unit={bp ? 'mmHg' : ''} rows={bpRows.length ? bpRows : ['Belum ada riwayat']} />
        <HealthPanel title="Gula darah" value={sugar ? `${num(sugar.sugar)}` : '—'} unit={sugar ? `mg/dL${sugar.sugar_context ? ` · ${sugar.sugar_context}` : ''}` : ''} rows={sugarRows.length ? sugarRows : ['Belum ada riwayat']} />
        <HealthPanel title="Berat badan" value={weight ? `${num(weight.weight_kg)}` : '—'} unit={weight ? 'kg' : ''} rows={weightRows.length ? weightRows : ['Belum ada riwayat']} />
        <HealthPanel title="Tanda vital lain" value={temp ? `${num(temp.temperature_c)} °C` : '—'} unit={temp?.pulse_bpm ? `Nadi ${num(temp.pulse_bpm)} BPM` : (records.some((r) => num(r.pulse_bpm) != null) ? 'Nadi tercatat' : '')} rows={vitalRows.length ? vitalRows : ['Belum ada riwayat']} />
      </div>
    )}
  </CitizenPanel>
}

export function CitizenHistoryPage() {
  const [filter, setFilter] = useState('Semua')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setRecords(demoTimeline.map((item, index) => ({ health_record_id: `demo-${index}`, examined_at: new Date(2026, 7, 23 - index * 3).toISOString(), systolic: index === 0 ? 120 : null, diastolic: index === 0 ? 80 : null, sugar: index === 0 ? 105 : null, weight_kg: index === 0 ? 68 : null, examiner_name: item.examiner })))
      setLoading(false)
      return
    }
    getMyHealthHistory(50)
      .then((rows) => { if (active) setRecords(rows ?? []) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const rows = records.map((record) => {
    const parts = []
    if (num(record.systolic) != null) parts.push({ title: 'Tekanan Darah', value: `${record.systolic}/${record.diastolic} mmHg` })
    if (num(record.sugar) != null) parts.push({ title: 'Gula Darah', value: `${num(record.sugar)} mg/dL${record.sugar_context ? ` · ${record.sugar_context}` : ''}` })
    if (num(record.weight_kg) != null) parts.push({ title: 'Berat Badan', value: `${num(record.weight_kg)} kg` })
    if (num(record.temperature_c) != null) parts.push({ title: 'Suhu Tubuh', value: `${num(record.temperature_c)} °C` })
    if (num(record.pulse_bpm) != null) parts.push({ title: 'Denyut Nadi', value: `${num(record.pulse_bpm)} BPM` })
    if (parts.length === 0) parts.push({ title: 'Pemeriksaan Umum', value: record.complaint || 'Catatan tersedia' })
    return parts.map((part) => ({ ...part, date: fmtDate(record.examined_at), examined_at: record.examined_at, examiner: record.examiner_name || 'Nakes Desa' }))
  }).flat()

  const filtered = rows.filter((row) => filter === 'Semua' || row.title.toLowerCase().includes(filter.toLowerCase()))
  return <CitizenPanel title="Riwayat pemeriksaan" intro="Gunakan riwayat sebagai bahan diskusi dengan tenaga kesehatan.">
    <label className="filter-field">Jenis data<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Semua</option><option>Tekanan</option><option>Gula</option><option>Berat</option><option>Suhu</option><option>Nadi</option></select></label>
    {loading ? <p className="muted-text">Memuat riwayat...</p> : filtered.length === 0 ? <p className="muted-text">Belum ada data untuk filter ini.</p> : (
      <div className="timeline">{filtered.slice(0, 40).map((item, index) => <div className="timeline-item" key={`${item.title}-${item.date}-${index}`}><div className="timeline-dot"><HeartPulse size={17} /></div><div><strong>{item.title}</strong><span>{[item.value].filter(Boolean).join(' · ')} · {item.date}</span><span>Pemeriksa: {item.examiner}</span></div></div>)}</div>
    )}
  </CitizenPanel>
}

export function CitizenProfilePage() {
  const [profile, setProfile] = useState(null); const [editing, setEditing] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState(''); const [form, setForm] = useState({ fullName: '', phone: '', bloodType: '' })
  useEffect(() => { void getCitizenContext().then((context) => { if (context.profile) { setProfile(context.profile); setForm({ fullName: context.profile.full_name, phone: context.profile.phone || '', bloodType: context.profile.blood_type || '' }) } }).catch(() => setError('Profil belum dapat dimuat.')) }, [])
  const save = async () => { setError(''); try { await updateCitizenProfile(form); setProfile((current) => ({ ...current, full_name: form.fullName, phone: form.phone, blood_type: form.bloodType || null })); setEditing(false); setSaved(true) } catch (err) { setError(err.message || 'Profil belum tersimpan.') } }
  const data = profile || { full_name: 'Budi Santoso', nik_last4: '0001', household_number: 'KK-01-01', rt_code: 'RT 01', blood_type: 'O+', family_relation: 'Kepala keluarga', birth_date: '1980-05-12', phone: '08••••••001' }
  return <CitizenPanel title="Profil saya" intro="NIK tetap terlindungi dan tidak dapat diubah dari halaman ini."><div className="profile-summary"><ShieldCheck size={22} /><div><strong>{data.full_name}</strong><span>NIK ****{data.nik_last4} · {data.household_number} · {data.rt_code}</span></div></div><div className="profile-grid"><ReadOnly label="Golongan darah" value={data.blood_type || 'Belum diisi'} /><ReadOnly label="Hubungan keluarga" value={data.family_relation || 'Belum diisi'} /><ReadOnly label="Tanggal lahir" value={data.birth_date || 'Belum diisi'} /><ReadOnly label="Nomor telepon" value={data.phone || 'Belum diisi'} /></div>{editing && <div className="staff-form"><label>Nama tampilan<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} maxLength="120" /></label><label>Nomor telepon<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength="30" /></label><label>Golongan darah<select value={form.bloodType} onChange={(event) => setForm({ ...form, bloodType: event.target.value })}><option value="">Belum diisi</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label><p className="muted-text">Perubahan terbatas dicatat pada audit log.</p><button className="btn btn-primary" onClick={() => void save()}><Save size={16} /> Simpan</button></div>}{error && <p role="alert" className="form-error">{error}</p>}{saved && <p className="form-success">Profil diperbarui.</p>}{!editing && <button className="btn btn-ghost" onClick={() => setEditing(true)}><Edit3 size={16} /> Ubah data terbatas</button>}</CitizenPanel>
}

export function CitizenFamilyPage() { const [family, setFamily] = useState([]); useEffect(() => { void getCitizenContext().then((context) => setFamily(context.family || [])).catch(() => setFamily([])) }, []); return <CitizenPanel title="Keluarga dalam satu KK" intro="Data keluarga dibatasi pada identitas minimum."><div className="family-list">{family.map((member) => <Family key={member.citizen_id} name={member.full_name} relation={member.family_relation || 'Anggota keluarga'} />)}</div>{family.length === 0 && <p className="muted-text">Data keluarga belum tersedia.</p>}</CitizenPanel> }

export function CitizenNotificationsPage() {
  const { access } = useAuth(); const [items, setItems] = useState([]); const load = async () => { try { setItems(await getCitizenNotifications()) } catch { setItems([]) } }
  useEffect(() => { void load(); return subscribeToNotifications({ userId: access?.user_id, onChange: () => void load() }) }, [access?.user_id])
  const markRead = async (id) => { await markCitizenNotificationRead(id); setItems((current) => current.map((item) => item.notification_id === id ? { ...item, read_at: new Date().toISOString() } : item)) }
  return <CitizenPanel title="Notifikasi" intro="Pemberitahuan kesehatan tidak menggantikan konsultasi."><div className="notification-list">{items.map((item) => <div className="notification-card" key={item.notification_id}><Bell size={20} color="var(--teal)" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString('id-ID')} · {item.read_at ? 'Sudah dibaca' : 'Belum dibaca'}</small></div>{!item.read_at && <button className="btn btn-soft" onClick={() => void markRead(item.notification_id)}>Tandai dibaca</button>}</div>)}</div>{items.length === 0 && <p className="muted-text">Belum ada notifikasi.</p>}</CitizenPanel>
}

export function EmergencyPage() { const [contacts, setContacts] = useState([]); const [error, setError] = useState(''); const load = () => getEmergencyContacts().then(setContacts).catch(() => setError('Kontak belum dapat dimuat.')); useEffect(() => { void load() }, []); return <CitizenPanel title="Bantuan darurat" intro="Aplikasi ini tidak menggantikan layanan darurat resmi."><div className="emergency-warning"><AlertTriangle size={22} /><div><strong>Jika kondisi gawat atau mengancam nyawa</strong><p>Hubungi layanan darurat resmi setempat atau minta bantuan orang di sekitar. Jangan menunggu aplikasi.</p></div></div><section className="emergency-instructions"><h2>Langkah cepat</h2><ol><li>Pastikan lokasi aman dan minta bantuan orang terdekat.</li><li>Hubungi layanan darurat resmi sesuai wilayah.</li><li>Gunakan kontak desa di bawah sebagai bantuan tambahan.</li></ol></section>{error && <p className="form-error">{error} <button className="btn btn-ghost" onClick={() => void load()}>Coba lagi</button></p>}<div className="contact-list">{contacts.map((contact) => <div className="contact-card emergency-contact" key={contact.emergency_contact_id}><div><strong>{contact.label}</strong><p>{contact.officer_name ? `${contact.officer_name} · siap membantu lewat telepon atau WhatsApp.` : 'Kontak demo desa · hasil bergantung jaringan dan perangkat.'}</p></div><div className="contact-actions"><a className="btn btn-danger" href={`tel:${contact.phone}`}><Phone size={16} /> Telepon</a>{contact.whatsapp_url && <a className="btn btn-ghost" href={contact.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a>}</div></div>)}</div></CitizenPanel> }

function CitizenPanel({ title, intro, children }) { return <div className="dashboard-page"><div className="container narrow-container"><Link className="back-link" to="/warga">← Kembali ke beranda</Link><div className="form-heading"><div className="icon-tile"><UserRound size={21} /></div><div><div className="eyebrow">Portal warga</div><h1 className="display">{title}</h1></div></div><p className="page-intro">{intro}</p>{children}</div></div> }
function HealthPanel({ title, value, unit, rows }) { return <section className="health-history-panel"><div className="health-metric-head"><span>{title}</span><Activity size={18} color="var(--teal)" /></div><strong>{value}</strong><span>{unit}</span><div className="mini-history">{rows.map((row) => <small key={row}>{row}</small>)}</div></section> }
function ReadOnly({ label, value }) { return <div className="profile-field"><small>{label}</small><strong>{value}</strong></div> }
function Family({ name, relation }) { return <div className="family-item"><span className="avatar">{name[0]}</span><div><strong>{name}</strong><small>{relation}</small></div><CheckCircle2 size={17} color="var(--teal)" /></div> }
