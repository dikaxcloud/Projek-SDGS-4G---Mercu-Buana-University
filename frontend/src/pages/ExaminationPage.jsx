import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardPlus, Info, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { searchCitizens, saveExamination } from '../features/health/healthService'
import { useAuth } from '../features/auth/AuthProvider'
import { calculateBmi, bmiLabel, needsFollowUp, validateExamination } from '../utils/health'
import { generateNakesNote, analyzeHealthRecord } from '../services/ai/aiService'

const initial = { citizenId: '', citizenName: '', systolic: '', diastolic: '', sugar: '', sugarContext: 'sewaktu', weight: '', height: '', temperature: '', pulse: '', complaint: '', notes: '', needsFollowUp: false }
export function ExaminationPage() {
  const { access } = useAuth(); const [params] = useSearchParams(); const navigate = useNavigate(); const [step, setStep] = useState(1); const [values, setValues] = useState({ ...initial }); const [status, setStatus] = useState({ type: '', message: '' }); const [saving, setSaving] = useState(false)
  // Real citizen list from database (seeded demo + Google-registered citizens).
  const [citizens, setCitizens] = useState([]); const [loadingCitizens, setLoadingCitizens] = useState(true)
  const presetCitizenId = params.get('citizen') ?? ''

  useEffect(() => {
    let active = true
    setLoadingCitizens(true)
    searchCitizens('')
      .then((list) => { if (active) setCitizens(list ?? []) })
      .catch((err) => { if (active) setStatus({ type: 'error', message: err.message || 'Daftar warga belum dapat dimuat.' }) })
      .finally(() => { if (active) setLoadingCitizens(false) })
    return () => { active = false }
  }, [])

  // Pre-select citizen when arriving from /nakes/warga/:id → "Mulai pemeriksaan".
  useEffect(() => {
    if (!presetCitizenId || !citizens.length) return
    setValues((current) => {
      if (current.citizenId) return current
      const match = citizens.find((item) => item.citizen_id === presetCitizenId)
      if (!match) return current
      return { ...current, citizenId: match.citizen_id, citizenName: match.full_name }
    })
  }, [citizens, presetCitizenId])

  const selectCitizen = (event) => {
    const match = citizens.find((item) => item.citizen_id === event.target.value)
    setValues((current) => ({ ...current, citizenId: match?.citizen_id ?? '', citizenName: match?.full_name ?? '' }))
  }
  const [draftingNote, setDraftingNote] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const lastSavedRecordId = useRef(null)

  const runAiAnalysis = async () => {
    setAiLoading(true); setAiError('')
    try {
      const aiRes = await analyzeHealthRecord(values, { citizenId: values.citizenId, recordId: lastSavedRecordId.current })
      setAiAnalysis(aiRes)
      if (aiRes?.degraded) setAiError('Data pemeriksaan tetap tersimpan. Analisis AI sementara tidak tersedia.')
    } catch {
      setAiError('Data pemeriksaan tetap tersimpan. Analisis AI sementara tidak tersedia.')
    } finally {
      setAiLoading(false)
    }
  }

  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }))
  const next = () => { if (step === 1 && !values.citizenId) return setStatus({ type: 'error', message: 'Silakan pilih warga terlebih dahulu.' }); if (step === 2) { const error = validateExamination(values); if (error) return setStatus({ type: 'error', message: error }) } setStatus({ type: '', message: '' }); setStep((value) => Math.min(3, value + 1)) }

  const handleGenerateNote = async () => {
    setDraftingNote(true)
    try {
      const noteDraft = await generateNakesNote(values)
      set('notes', noteDraft)
    } finally {
      setDraftingNote(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!values.citizenId) return setStatus({ type: 'error', message: 'Silakan pilih warga terlebih dahulu.' })
    const error = validateExamination(values); if (error) return setStatus({ type: 'error', message: error }); setSaving(true); setStatus({ type: '', message: '' });
    try {
      const result = await saveExamination({ citizenId: values.citizenId, values: { ...values, needsFollowUp: values.needsFollowUp || needsFollowUp(values) }, idempotencyKey: crypto.randomUUID(), userId: access?.user_id });
      
      // Trigger AI Analysis in non-blocking way — save result is never affected.
      lastSavedRecordId.current = result?.health_record_id ?? null
      void runAiAnalysis()

      if (result.status === 'already_saved') setStatus({ type: 'success', message: 'Pemeriksaan sudah tersimpan.' });
      else {
        setStatus({ type: 'success', message: 'Pemeriksaan berhasil disimpan.' });
        setTimeout(() => navigate(`/nakes/warga/${values.citizenId}`), 2500)
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Pemeriksaan belum tersimpan. Coba lagi.' })
    } finally {
      setSaving(false)
    }
  }

  return <div className="staff-page"><div className="container narrow-container"><Link to="/nakes" className="back-link"><ArrowLeft size={15} /> Kembali</Link><div className="form-heading"><div className="icon-tile"><ClipboardPlus size={22} /></div><div><div className="eyebrow">Pemeriksaan baru</div><h1 className="display">Catat hasil pemeriksaan</h1></div></div><div className="form-progress">{[1, 2, 3].map((number) => <span key={number} className={number <= step ? 'active' : ''}>{number}</span>)}</div><form className="staff-form" onSubmit={submit}>{step === 1 && <><h2>Siapa yang diperiksa?</h2><p className="muted-text">Pilih dari daftar warga terdaftar. NIK hanya ditampilkan terbatas.</p><label>Warga<select value={values.citizenId} onChange={selectCitizen}><option value="">{loadingCitizens ? 'Memuat daftar warga…' : 'Pilih warga'}</option>{citizens.map((citizen) => <option value={citizen.citizen_id} key={citizen.citizen_id}>{citizen.full_name} · {citizen.rt_code} · NIK ****{citizen.nik_last4}</option>)}</select></label>{!loadingCitizens && citizens.length === 0 && <p className="muted-text">Belum ada warga terdaftar pada sistem.</p>}{values.citizenName && <div className="selected-citizen"><strong>{values.citizenName}</strong><span>Data identitas tersimpan secara aman.</span></div>}</>}{step === 2 && <><h2>Hasil pemeriksaan</h2><p className="muted-text">Isi bagian yang tersedia. Nilai di luar rentang akan ditolak.</p><div className="form-section"><h3>Tekanan darah</h3><div className="field-grid"><Field label="Sistolik" value={values.systolic} set={(value) => set('systolic', value)} suffix="mmHg" /><Field label="Diastolik" value={values.diastolic} set={(value) => set('diastolic', value)} suffix="mmHg" /></div></div><div className="form-section"><h3>Gula darah</h3><div className="field-grid"><Field label="Nilai" value={values.sugar} set={(value) => set('sugar', value)} suffix="mg/dL" /><label>Jenis pemeriksaan<select value={values.sugarContext} onChange={(e) => set('sugarContext', e.target.value)}><option value="sewaktu">Sewaktu</option><option value="puasa">Puasa</option><option value="setelah_makan">Setelah makan</option></select></label></div></div><div className="form-section"><h3>Fisik & Nadi</h3><div className="field-grid"><Field label="Berat badan" value={values.weight} set={(v) => set('weight', v)} suffix="kg" /><Field label="Tinggi badan" value={values.height} set={(v) => set('height', v)} suffix="cm" /><Field label="Suhu" value={values.temperature} set={(v) => set('temperature', v)} suffix="°C" /><Field label="Denyut Nadi" value={values.pulse} set={(v) => set('pulse', v)} suffix="bpm" /></div></div></>}{step === 3 && <><h2>Catatan Tambahan & AI Note</h2><div className="form-section"><label>Keluhan<textarea value={values.complaint} onChange={(e) => set('complaint', e.target.value)} placeholder="Tuliskan keluhan warga jika ada..." /></label><div style={{ marginTop: '0.75rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label>Catatan Rekam Medis</label><button type="button" onClick={handleGenerateNote} disabled={draftingNote} className="button secondary size-sm" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Sparkles size={14} /> {draftingNote ? 'Membuat Catatan...' : '✨ Bantu Buat Catatan'}</button></div><textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Catatan medis..." rows={4} /></div></div></>}<div className="form-actions">{step > 1 && <button type="button" onClick={() => setStep((s) => s - 1)} className="button secondary">Sebelumnya</button>}{step < 3 ? <button type="button" onClick={next} className="button primary">Selanjutnya <ArrowRight size={16} /></button> : <button type="submit" disabled={saving} className="button primary">{saving ? 'Menyimpan...' : 'Simpan Hasil Pemeriksaan'}</button>}</div>{status.message && <div className={`status-banner ${status.type}`}>{status.message}</div>}{aiError && <div role="status" style={{ marginTop: '1.5rem', border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', borderRadius: '0.5rem', padding: '0.85rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}><span>{aiError}</span>{!aiLoading && <button type="button" onClick={() => void runAiAnalysis(true)} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', border: 0, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}><RefreshCw size={13} /> Coba Lagi</button>}</div>}{aiLoading && !aiAnalysis && <div style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader2 size={14} className="spin" /> ✨ AI sedang membaca hasil pemeriksaan…</div>}{aiAnalysis && <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #6366f1', padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'rgba(99, 102, 241, 0.05)' }}><h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}><Sparkles size={18} color="#6366f1" /> ✨ Analisis AI Kesehatan</h3><div style={{ marginBottom: '0.5rem' }}><span className={`badge ${aiAnalysis.statusUi?.color || ''}`}>{aiAnalysis.statusUi?.label}</span></div><p style={{ margin: '0.5rem 0' }}>{aiAnalysis.summary}</p>{aiAnalysis.observations?.length > 0 && <ul style={{ margin: '0.25rem 0 0.25rem 1.1rem', fontSize: '0.83rem', color: '#374151' }}>{aiAnalysis.observations.map((item, index) => <li key={index}>{item}</li>)}</ul>}{aiAnalysis.recommendations?.length > 0 && <ul style={{ margin: '0.25rem 0 0.25rem 1.1rem', fontSize: '0.83rem', color: '#374151' }}>{aiAnalysis.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>}<div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>{aiAnalysis.disclaimer}</div></div>}</form></div></div>
}
function Field({ label, value, set, suffix }) { return <label>{label}<div className="input-with-suffix"><input type="number" min="0" value={value} onChange={(event) => set(event.target.value)} /><span>{suffix}</span></div></label> }
