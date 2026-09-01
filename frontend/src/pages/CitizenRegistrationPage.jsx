import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Home, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { registerCitizen } from '../features/auth/authService'
import { registerNewHousehold, getPublicHouseholds } from '../features/health/healthService'
import { useAuth } from '../features/auth/AuthProvider'
import { isSupabaseConfigured } from '../lib/supabase'

const initial = {
  p_nik: '', p_full_name: '', p_rt_code: 'RT 01', p_phone: '', p_birth_place: '',
  p_birth_date: '', p_gender: '', p_blood_type: '', p_family_relation: 'kepala keluarga',
  p_address: '', household_id: '',
}
const initialNewKK = { kk_number: '', head_name: '', address: '' }

export function CitizenRegistrationPage() {
  const navigate = useNavigate()
  const { refreshAccess } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(initial)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [saving, setSaving] = useState(false)

  // Household selection
  const [households, setHouseholds] = useState([])
  const [loadingHH, setLoadingHH] = useState(false)
  const [newKKMode, setNewKKMode] = useState(false)
  const [newKK, setNewKK] = useState(initialNewKK)

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  // Load registered households whenever RT changes
  useEffect(() => {
    if (!isSupabaseConfigured || !form.p_rt_code) return
    let active = true
    setLoadingHH(true); setHouseholds([]); setForm((c) => ({ ...c, household_id: '' }))
    getPublicHouseholds(form.p_rt_code.replace(/\s/g, ''))
      .then((rows) => { if (active) setHouseholds(rows ?? []) })
      .catch(() => {})
      .finally(() => { if (active) setLoadingHH(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.p_rt_code])

  const next = () => {
    setStatus({ type: '', message: '' })
    if (step === 1) {
      if (!/^\d{16}$/.test(form.p_nik)) return setStatus({ type: 'error', message: 'NIK harus terdiri dari 16 digit angka sesuai KTP.' })
      if (!form.p_full_name.trim()) return setStatus({ type: 'error', message: 'Nama lengkap wajib diisi.' })
    }
    if (step === 2 && !newKKMode && !form.household_id) return setStatus({ type: 'error', message: 'Pilih Kartu Keluarga keluarga Anda dari daftar.' })
    if (step === 2 && newKKMode) {
      if (!/^\d{16}$/.test(newKK.kk_number.replace(/[\s-]/g, ''))) return setStatus({ type: 'error', message: 'Nomor KK harus 16 digit angka sesuai kartu keluarga.' })
      if (!newKK.head_name.trim()) return setStatus({ type: 'error', message: 'Nama kepala keluarga wajib diisi.' })
    }
    setStep((value) => Math.min(3, value + 1))
  }

  const submit = async (event) => {
    event.preventDefault(); setStatus({ type: '', message: '' })
    // Tekan Enter pada step 1/2 tidak boleh mengirim data — perlakukan seperti tombol "Lanjut"
    if (step !== 3) return next()
    if (!form.p_phone.trim()) return setStatus({ type: 'error', message: 'Nomor HP wajib diisi.' })
    if (!form.p_gender) return setStatus({ type: 'error', message: 'Jenis kelamin wajib dipilih.' })
    if (!form.p_blood_type) return setStatus({ type: 'error', message: 'Golongan darah wajib dipilih.' })
    if (!form.p_address.trim()) return setStatus({ type: 'error', message: 'Alamat rumah wajib diisi.' })
    setSaving(true)
    try {
      let householdId = form.household_id
      if (newKKMode) {
        const hh = await registerNewHousehold({
          rtCode: form.p_rt_code,
          kkNumber: newKK.kk_number,
          headName: newKK.head_name,
          address: newKK.address,
        })
        householdId = hh.household_id
      }

      const result = await registerCitizen({
        ...form,
        p_household_id: householdId,
        p_household_number: newKKMode ? newKK.kk_number : form.p_household_number,
      })

      if (result.status === 'pending_verification') {
        await refreshAccess(); navigate('/warga', { replace: true }); return
      }
      if (result.status === 'nik_duplicate') return setStatus({ type: 'error', message: 'NIK tersebut sudah terdaftar. Tidak ada data baru yang dibuat — hubungi petugas desa jika ini adalah Anda.' })
      if (result.status === 'already_linked') return setStatus({ type: 'error', message: 'Akun ini sudah terhubung ke profil warga.' })
      setStatus({ type: 'error', message: 'Registrasi belum lengkap. Coba lagi.' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Registrasi belum berhasil. Coba lagi.' })
    } finally { setSaving(false) }
  }

  return (
    <main className="auth-page"><div className="auth-card">
      <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13 }}><ArrowLeft size={15} /> Kembali</Link>
      <div style={{ marginTop: 24 }}><Brand /></div>
      <h1 className="display">Daftar sebagai Warga</h1>
      <p>Lengkapi identitas Anda sesuai KTP dan Kartu Keluarga. Data akan diverifikasi oleh admin desa sebelum akun aktif.</p>
      <div className="register-progress" style={{ display: 'flex', gap: 6, marginBottom: 22 }}>{[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'active' : ''} style={{ height: 6, flex: 1, borderRadius: 8, background: item <= step ? 'var(--teal)' : 'var(--line)', transition: 'background .25s' }} />)}</div>

      <form onSubmit={submit}>
        {step === 1 && <>
          <Field label="NIK (16 digit sesuai KTP)" value={form.p_nik} onChange={(v) => set('p_nik', v.replace(/\D/g, '').slice(0, 16))} inputMode="numeric" placeholder="Contoh: 3273010101900001" />
          <Field label="Nama lengkap (sesuai KTP)" value={form.p_full_name} onChange={(v) => set('p_full_name', v)} placeholder="Contoh: Budi Santoso" />
          <div className="field-grid">
            <Field label="Tempat lahir" value={form.p_birth_place} onChange={(v) => set('p_birth_place', v)} placeholder="Contoh: Bandung" />
            <Field label="Tanggal lahir" type="date" value={form.p_birth_date} onChange={(v) => set('p_birth_date', v)} />
          </div>
        </>}

        {step === 2 && <>
          <Field label="RT / Wilayah" select value={form.p_rt_code} onChange={(v) => set('p_rt_code', v)} options={['RT 01', 'RT 02', 'RT 03', 'RT 04', 'RT 05']} />

          {!newKKMode ? (
            <>
              <label style={{ ...labelStyle }}>
                Pilih Kartu Keluarga keluarga Anda
                {loadingHH ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, color: 'var(--muted)', minHeight: 46 }}><RefreshCw size={14} /> Memuat daftar KK...</div>
                ) : households.length > 0 ? (
                  <select value={form.household_id} onChange={(e) => set('household_id', e.target.value)} style={{ width: '100%', maxWidth: '100%', minHeight: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 13, color: 'var(--ink)', background: '#fff', boxSizing: 'border-box', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <option value="">— Pilih kepala keluarga —</option>
                    {households.map((hh) => (
                      <option key={hh.household_id} value={hh.household_id}>
                        Kepala: {hh.head_name} · KK ****{hh.kk_last4}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ minHeight: 46, padding: '10px 12px', border: '1px dashed var(--line)', borderRadius: 13, fontWeight: 400, color: 'var(--muted)' }}>
                    Belum ada KK terdaftar pada RT ini.
                  </div>
                )}
              </label>

              <button type="button" className="btn btn-ghost btn-wide" onClick={() => { setNewKKMode(true); setForm((c) => ({ ...c, household_id: '' })) }} style={{ marginTop: 6 }}>
                <Home size={15} /> Keluarga saya belum terdaftar — daftarkan KK baru
              </button>
            </>
          ) : (
            <>
              <div style={{ background: '#f0faf7', border: '1px solid #bfe3da', borderRadius: 13, padding: 12, fontSize: 12.5, margin: '4px 0 8px' }}>
                Daftarkan Kartu Keluarga baru dengan nomor KK sesuai dokumen resmi keluarga Anda.
                <button type="button" onClick={() => { setNewKKMode(false); setNewKK(initialNewKK) }} style={{ display: 'block', marginTop: 6, background: 'none', border: 0, color: 'var(--teal)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>← Pilih dari daftar KK terdaftar</button>
              </div>
              <Field label="Nomor KK (16 digit sesuai dokumen)" value={newKK.kk_number} onChange={(v) => setNewKK({ ...newKK, kk_number: v.replace(/\D/g, '').slice(0, 16) })} inputMode="numeric" placeholder="Contoh: 3204012304560001" />
              <Field label="Nama kepala keluarga" value={newKK.head_name} onChange={(v) => setNewKK({ ...newKK, head_name: v })} placeholder="Sesuai kartu keluarga" />
              <Field label="Alamat rumah" value={newKK.address} onChange={(v) => setNewKK({ ...newKK, address: v })} placeholder="Contoh: Jalan Kenanga No. 3, Desa Kenanga" />
            </>
          )}

          <Field label="Status dalam keluarga" select value={form.p_family_relation} onChange={(v) => set('p_family_relation', v)} options={['kepala keluarga', 'istri', 'anak', 'anggota keluarga lainnya']} />
        </>}

        {step === 3 && <>
          <Field label="Nomor HP" value={form.p_phone} onChange={(v) => set('p_phone', v.replace(/[^\d+\-\s]/g, '').slice(0, 20))} inputMode="tel" placeholder="08xxxxxxxxxx" />
          <Field label="Jenis kelamin" select value={form.p_gender} onChange={(v) => set('p_gender', v)} options={['laki-laki', 'perempuan']} />
          <Field label="Golongan darah" select value={form.p_blood_type} onChange={(v) => set('p_blood_type', v)} options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} />
          <label style={labelStyle}>Alamat rumah<textarea rows={2} value={form.p_address} onChange={(e) => set('p_address', e.target.value)} placeholder="Alamat tempat tinggal saat ini..." style={{ ...inputStyle, padding: 10 }} /></label>
          <p className="muted-text">Setelah dikirim, data Anda berstatus <strong>PENDING_VERIFICATION</strong> dan akan diperiksa admin desa.</p>
        </>}

        {status.message && <p role="alert" style={{ margin: '14px 0 0', color: status.type === 'error' ? '#b42318' : 'var(--teal-dark)', fontSize: 13 }}>{status.message}</p>}

        <div className="registration-actions" style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {step > 1 && <button type="button" className="btn btn-ghost" onClick={() => setStep((v) => v - 1)}>Kembali</button>}
          {step < 3
            ? <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={next}>Lanjut <ArrowRight size={16} /></button>
            : <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? 'Menyimpan...' : 'Kirim Pendaftaran'}</button>}
        </div>
      </form>
    </div></main>
  )
}

const inputStyle = { minHeight: 46, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 13, color: 'var(--ink)', background: '#fff' }
const labelStyle = { display: 'grid', gap: 7, marginTop: 14, fontSize: 13, fontWeight: 700 }

function Field({ label, value, onChange, select, options = [], hint, type = 'text', ...props }) {
  return (
    <label style={labelStyle}>
      {label}
      {select ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
          <option value="">Pilih</option>
          {(typeof options[0] === 'string' ? options.map((o) => ({ v: o, l: o })) : options).map(({ v, l }) => <option key={v} value={v}>{l ?? v}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} style={inputStyle} />
      )}
      {hint && <small style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>{hint}</small>}
    </label>
  )
}
