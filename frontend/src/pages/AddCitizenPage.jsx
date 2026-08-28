import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createActivationCode, createStaffCitizen, listStaffHouseholds, listStaffRts } from '../features/staff/staffService'

const initial = { nik: '', full_name: '', phone: '', birth_date: '', gender: '', blood_type: '', family_relation: 'kepala keluarga', rt_id: '', household_id: '' }

export function AddCitizenPage({ basePath }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [rts, setRts] = useState([])
  const [households, setHouseholds] = useState([])
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [activationCode, setActivationCode] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([listStaffRts(), listStaffHouseholds('')])
      .then(([nextRts, nextHouseholds]) => { if (!active) return; setRts(nextRts ?? []); setHouseholds(nextHouseholds ?? []) })
      .catch((err) => { if (active) setError(err.message || 'Data wilayah belum dapat dimuat.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rtOptions = useMemo(() => rts ?? [], [rts])
  const kkOptions = useMemo(() => households.filter((item) => !form.rt_id || item.rt_id === form.rt_id), [households, form.rt_id])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const validateStep1 = () => {
    if (!/^\d{16}$/.test(form.nik)) return 'NIK harus terdiri dari 16 digit angka.'
    if (!form.full_name.trim()) return 'Nama lengkap wajib diisi.'
    return ''
  }

  const next = () => {
    setError('')
    if (step === 1) {
      const message = validateStep1()
      if (message) return setError(message)
    }
    if (step === 2 && (!form.household_id)) return setError('Pilih Kartu Keluarga (KK) tujuan. Jika belum ada, tambahkan dulu di menu Manajemen KK.')
    setStep((value) => Math.min(3, value + 1))
  }

  const submit = async (event) => {
    event.preventDefault(); setError('')
    // Tekan Enter pada step 1/2 tidak boleh menyimpan data — perlakukan seperti tombol "Lanjut"
    if (step !== 3) return next()
    setSaving(true)
    try {
      const response = await createStaffCitizen(form)
      if (response.status === 'duplicate') {
        setResult({ duplicate: true, citizenId: response.citizen_id })
      } else {
        setResult({ duplicate: false, citizenId: response.citizen_id })
      }
    } catch (err) {
      setError(err.message || 'Warga belum berhasil disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const generateCode = async () => {
    setActivationCode('')
    try {
      const code = await createActivationCode(result.citizenId)
      setActivationCode(code)
    } catch (err) {
      setError(err.message || 'Kode aktivasi belum dapat dibuat.')
    }
  }

  const inputStyle = { minHeight: 46, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }
  const labelWrap = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 14 }

  if (result) {
    return (
      <div className="staff-page"><div className="container narrow-container">
        <Link className="back-link" to={`${basePath}/warga`}><ArrowLeft size={15} /> Kembali</Link>
        <div className="form-heading"><div className="icon-tile"><UserPlus size={21} /></div><div><div className="eyebrow">Tambah warga</div>
          <h1 className="display">{result.duplicate ? 'Warga sudah terdaftar' : 'Warga berhasil ditambahkan'}</h1></div></div>

        {result.duplicate ? (
          <div className="card" style={{ border: '1px solid #fcd34d', background: '#fffbeb', padding: '1rem', borderRadius: 12 }}>
            <p style={{ margin: '0 0 8px' }}><strong>Warga dengan NIK tersebut sudah terdaftar.</strong></p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Tidak ada data baru yang dibuat agar identitas tetap unik.</p>
          </div>
        ) : (
          <div className="card" style={{ border: '1px solid #bfe3da', background: '#f0faf7', padding: '1rem', borderRadius: 12 }}>
            <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}><CheckCircle2 size={18} color="var(--teal)" /> Warga berhasil ditambahkan.</p>
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>Citizen ID dibuat otomatis oleh sistem:</p>
            <code style={{ fontSize: 12, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '3px 8px' }}>{result.citizenId}</code>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>Status akun Google saat ini: <strong>🟡 Belum terhubung</strong>. Buat kode aktivasi lalu berikan kepada warga untuk dihubungkan lewat halaman "Hubungkan Akun".</p>
            {activationCode && (
              <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--teal)', borderRadius: 12, background: '#fff' }}>
                <strong style={{ letterSpacing: 2, fontSize: 20 }}>{activationCode}</strong>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>Berlaku 15 menit, sekali pakai. Minta warga login Google lalu buka menu "Hubungkan Akun" dan masukkan kode ini.</p>
              </div>
            )}
            {!activationCode && (
              <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => void generateCode()}><KeyRound size={15} /> Buat Kode Aktivasi</button>
            )}
            {activationCode && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => void generateCode()}>Buat ulang kode</button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setResult(null); setForm(initial); setStep(1); setActivationCode('') }}>Tambah warga lain</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`${basePath}/warga`)}>Selesai</button>
        </div>
      </div></div>
    )
  }

  return (
    <div className="staff-page"><div className="container narrow-container">
      <Link className="back-link" to={`${basePath}/warga`}><ArrowLeft size={15} /> Kembali</Link>
      <div className="form-heading"><div className="icon-tile"><UserPlus size={21} /></div><div><div className="eyebrow">Manajemen warga</div><h1 className="display">Tambah warga</h1></div></div>
      <div className="form-progress">{[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'active' : ''}>{item}</span>)}</div>

      {error && <div className="staff-alert"><span>{error}</span></div>}
      {loading ? <p className="muted-text">Memuat data RT & KK...</p> : (
        <form className="staff-form" onSubmit={submit}>
          {step === 1 && (
            <>
              <h2>Identitas warga</h2>
              <label style={labelWrap}>NIK (16 digit)<input inputMode="numeric" maxLength={16} value={form.nik} onChange={(event) => set('nik', event.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="Contoh: 3273010101900001" style={inputStyle} /></label>
              <label style={labelWrap}>Nama lengkap<input required value={form.full_name} onChange={(event) => set('full_name', event.target.value)} placeholder="Contoh: Budi Santoso" style={inputStyle} /></label>
              <div className="field-grid">
                <label style={labelWrap}>Tanggal lahir<input type="date" value={form.birth_date} onChange={(event) => set('birth_date', event.target.value)} style={inputStyle} /></label>
                <label style={labelWrap}>Jenis kelamin<select value={form.gender} onChange={(event) => set('gender', event.target.value)} style={inputStyle}><option value="">Pilih</option><option value="laki-laki">Laki-laki</option><option value="perempuan">Perempuan</option></select></label>
              </div>
              <div className="field-grid">
                <label style={labelWrap}>Golongan darah<select value={form.blood_type} onChange={(event) => set('blood_type', event.target.value)} style={inputStyle}><option value="">Pilih</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type}>{type}</option>)}</select></label>
                <label style={labelWrap}>Nomor HP<input inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value.replace(/[^\d+\-\s]/g, ''))} placeholder="08xxxxxxxxxx" style={inputStyle} /></label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Data keluarga</h2>
              <label style={labelWrap}>RT
                <select value={form.rt_id} onChange={(event) => { set('rt_id', event.target.value); set('household_id', '') }} style={inputStyle}>
                  <option value="">Pilih RT</option>
                  {rtOptions.map((rt) => <option key={rt.rt_id} value={rt.rt_id}>{rt.code}</option>)}
                </select>
              </label>
              <label style={labelWrap}>Kartu Keluarga (KK)
                <select value={form.household_id} onChange={(event) => set('household_id', event.target.value)} style={inputStyle} disabled={!form.rt_id && !!form.household_id}>
                  <option value="">{kkOptions.length ? 'Pilih nomor KK' : (form.rt_id ? 'Belum ada KK pada RT ini' : 'Pilih RT dahulu')}</option>
                  {kkOptions.map((kk) => <option key={kk.household_id} value={kk.household_id}>{kk.household_number} · {kk.head_name}{form.rt_id ? '' : ` · ${kk.rt_code}`}</option>)}
                </select>
              </label>
              <p className="muted-text">KK tidak ditemukan? Tambahkan dulu melalui menu Manajemen KK pada dashboard admin.</p>
              <label style={labelWrap}>Status dalam keluarga
                <select value={form.family_relation} onChange={(event) => set('family_relation', event.target.value)} style={inputStyle}>
                  {['kepala keluarga', 'istri', 'anak', 'anggota keluarga lainnya'].map((relation) => <option key={relation} value={relation}>{relation.charAt(0).toUpperCase() + relation.slice(1)}</option>)}
                </select>
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Tinjau & simpan</h2>
              <div className="selected-citizen" style={{ alignItems: 'flex-start' }}>
                <CheckCircle2 size={18} />
                <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  <span><strong>{form.full_name}</strong></span>
                  <span>NIK: {form.nik.replace(/\d(?=\d{4})/g, '•')}</span>
                  {form.birth_date && <span>Tanggal lahir: {form.birth_date}</span>}
                  {form.gender && <span>Jenis kelamin: {form.gender}</span>}
                  {form.blood_type && <span>Golongan darah: {form.blood_type}</span>}
                  {form.phone && <span>HP: {form.phone}</span>}
                  <span>KK: {(households.find((item) => item.household_id === form.household_id)?.household_number) ?? '-'} · Status: {form.family_relation}</span>
                </div>
              </div>
              <p className="muted-text">Citizen ID akan dibuat otomatis oleh sistem. Status awal akun Google: Belum terhubung.</p>
            </>
          )}

          <div className="form-actions" style={{ marginTop: 18 }}>
            {step > 1 && <button type="button" className="btn btn-ghost" onClick={() => setStep((value) => value - 1)}>Kembali</button>}
            {step < 3
              ? <button type="button" className="btn btn-primary" onClick={next}>Lanjut <ArrowRight size={15} /></button>
              : <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <Loader2 size={15} /> : <UserPlus size={15} />} {saving ? 'Menyimpan...' : 'Simpan Data Warga'}</button>}
          </div>
        </form>
      )}
    </div></div>
  )
}
