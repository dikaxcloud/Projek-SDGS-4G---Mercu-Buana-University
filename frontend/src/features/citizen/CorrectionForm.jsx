import { useState } from 'react'
import { AlertTriangle, ClipboardCheck, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { updateMyRegistration } from './citizenService'

const STATUS_META = {
  needs_correction: { label: 'Perlu Perbaikan', tone: 'warning', icon: AlertTriangle },
  rejected: { label: 'Ditolak', tone: 'danger', icon: AlertTriangle },
  pending: { label: 'Menunggu Verifikasi', tone: 'info', icon: ShieldCheck },
}

const maskNumber = (value, visible = 4) => {
  const text = String(value ?? '').replace(/\s/g, '')
  if (!text) return 'Tidak tersedia'
  return `••••••••${text.slice(-visible)}`
}

const validateValues = (values) => {
  const next = {}
  const name = values.full_name.trim()
  const phone = values.phone.trim()
  const address = values.address.trim()

  if (name.length < 2) next.full_name = 'Nama lengkap wajib diisi minimal 2 karakter.'
  if (!values.gender) next.gender = 'Pilih jenis kelamin.'
  if (!values.blood_type) next.blood_type = 'Pilih golongan darah.'
  if (!phone) next.phone = 'Nomor HP wajib diisi.'
  else if (!/^[+()\d\s-]{8,20}$/.test(phone)) next.phone = 'Gunakan format nomor HP yang valid, misalnya 081234567890.'
  if (!address) next.address = 'Alamat lengkap wajib diisi.'
  if (values.birth_date) {
    const birth = new Date(`${values.birth_date}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (Number.isNaN(birth.getTime())) next.birth_date = 'Tanggal lahir tidak valid.'
    else if (birth > today) next.birth_date = 'Tanggal lahir tidak boleh melewati hari ini.'
  }
  return next
}

export function CorrectionForm({ profile, onSaved, onCancel }) {
  const status = profile?.verification_status || 'pending'
  const meta = STATUS_META[status] || STATUS_META.pending
  const StatusIcon = meta.icon
  const [values, setValues] = useState({
    full_name: profile?.full_name ?? '',
    birth_place: profile?.birth_place ?? '',
    birth_date: profile?.birth_date ?? '',
    gender: profile?.gender ?? '',
    blood_type: profile?.blood_type ?? '',
    family_relation: profile?.family_relation ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    household_id: profile?.household_id ?? '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const setValue = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setSubmitError('')
  }

  const validateOne = (key, value) => {
    const next = validateValues({ ...values, [key]: value })
    setErrors((current) => ({ ...current, [key]: next[key] || '' }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSubmitError('')
    const nextErrors = validateValues(values)
    setErrors(nextErrors)
    const firstError = Object.keys(nextErrors)[0]
    if (firstError) {
      document.getElementById(`correction-${firstError}`)?.focus()
      return
    }

    setSaving(true)
    try {
      await updateMyRegistration(values)
      onSaved?.()
    } catch (err) {
      setSubmitError(err?.message || 'Perbaikan data belum tersimpan. Periksa koneksi lalu coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="correction-form" onSubmit={submit} noValidate>
      <header className="correction-header">
        <div className="correction-icon" aria-hidden="true"><ClipboardCheck size={24} /></div>
        <div className="correction-heading">
          <div className="eyebrow">Pendaftaran warga</div>
          <h1>Perbaiki Data Pendaftaran</h1>
          <p>Perbarui data sesuai catatan dari petugas. Setelah dikirim, data akan diperiksa kembali oleh RT/RW.</p>
        </div>
        <span className={`correction-status is-${meta.tone}`}>
          <StatusIcon size={14} aria-hidden="true" /> {meta.label}
        </span>
      </header>

      <div className={`correction-note${profile?.verification_note ? '' : ' is-neutral'}`}>
        <div className="correction-note-icon" aria-hidden="true"><AlertTriangle size={18} /></div>
        <div>
          <strong>Catatan dari petugas</strong>
          <p>{profile?.verification_note || 'Belum ada catatan tambahan. Periksa kembali seluruh data sebelum mengirim.'}</p>
        </div>
      </div>

      <div className="correction-locked" aria-label="Data identitas yang tidak dapat diubah warga">
        <div className="correction-locked-head">
          <LockKeyhole size={17} aria-hidden="true" />
          <div>
            <strong>Identitas terkunci</strong>
            <span>NIK dan nomor KK hanya dapat dikoreksi oleh petugas.</span>
          </div>
        </div>
        <div className="correction-locked-grid">
          <div className="correction-locked-item"><span>NIK</span><strong>{maskNumber(profile?.nik_last4)}</strong></div>
          <div className="correction-locked-item"><span>Nomor KK</span><strong>{maskNumber(profile?.household_number)}</strong></div>
        </div>
        <p className="correction-locked-help">Jika catatan petugas meminta koreksi NIK atau KK, hubungi petugas RT/RW. Perubahan data lain dapat dilakukan melalui formulir ini.</p>
      </div>

      <section className="correction-section" aria-labelledby="correction-identity-title">
        <div className="correction-section-head">
          <h2 id="correction-identity-title">Identitas warga</h2>
          <span>Data utama sesuai KTP dan kartu keluarga.</span>
        </div>
        <div className="correction-grid">
          <label className="correction-field correction-field-full">
            <span>Nama lengkap <b aria-hidden="true">*</b></span>
            <input
              id="correction-full_name"
              value={values.full_name}
              onChange={(event) => setValue('full_name', event.target.value)}
              onBlur={() => validateOne('full_name', values.full_name)}
              placeholder="Nama lengkap sesuai KTP"
              autoComplete="name"
              aria-required="true"
              aria-invalid={Boolean(errors.full_name)}
              aria-describedby={errors.full_name ? 'correction-full_name-error' : undefined}
            />
            {errors.full_name && <small id="correction-full_name-error" className="correction-error">{errors.full_name}</small>}
          </label>

          <label className="correction-field">
            <span>Jenis kelamin <b aria-hidden="true">*</b></span>
            <select
              id="correction-gender"
              value={values.gender}
              onChange={(event) => setValue('gender', event.target.value)}
              onBlur={() => validateOne('gender', values.gender)}
              aria-required="true"
              aria-invalid={Boolean(errors.gender)}
              aria-describedby={errors.gender ? 'correction-gender-error' : undefined}
            >
              <option value="">Pilih jenis kelamin</option>
              <option value="laki-laki">Laki-laki</option>
              <option value="perempuan">Perempuan</option>
              <option value="lainnya">Lainnya</option>
            </select>
            {errors.gender && <small id="correction-gender-error" className="correction-error">{errors.gender}</small>}
          </label>

          <label className="correction-field">
            <span>Hubungan dalam keluarga</span>
            <select value={values.family_relation} onChange={(event) => setValue('family_relation', event.target.value)}>
              <option value="">Pilih hubungan</option>
              {['kepala keluarga', 'istri', 'pasangan', 'anak', 'menantu', 'cucu', 'orang tua', 'saudara', 'anggota keluarga lainnya', 'lainnya'].map((relation) => (
                <option key={relation} value={relation}>{relation}</option>
              ))}
            </select>
          </label>

          <label className="correction-field">
            <span>Golongan darah <b aria-hidden="true">*</b></span>
            <select
              id="correction-blood_type"
              value={values.blood_type}
              onChange={(event) => setValue('blood_type', event.target.value)}
              onBlur={() => validateOne('blood_type', values.blood_type)}
              aria-required="true"
              aria-invalid={Boolean(errors.blood_type)}
              aria-describedby={errors.blood_type ? 'correction-blood_type-error' : undefined}
            >
              <option value="">Pilih golongan darah</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type}>{type}</option>)}
            </select>
            {errors.blood_type && <small id="correction-blood_type-error" className="correction-error">{errors.blood_type}</small>}
          </label>
        </div>
      </section>

      <section className="correction-section" aria-labelledby="correction-birth-title">
        <div className="correction-section-head">
          <h2 id="correction-birth-title">Informasi kelahiran</h2>
          <span>Isi sesuai akta kelahiran atau data yang tercatat.</span>
        </div>
        <div className="correction-grid">
          <label className="correction-field">
            <span>Tempat lahir</span>
            <input value={values.birth_place} onChange={(event) => setValue('birth_place', event.target.value)} placeholder="Kota atau kabupaten kelahiran" autoComplete="address-level2" />
          </label>
          <label className="correction-field">
            <span>Tanggal lahir</span>
            <input
              id="correction-birth_date"
              type="date"
              value={values.birth_date ?? ''}
              onChange={(event) => setValue('birth_date', event.target.value)}
              onBlur={() => validateOne('birth_date', values.birth_date)}
              aria-invalid={Boolean(errors.birth_date)}
              aria-describedby={errors.birth_date ? 'correction-birth_date-error' : undefined}
            />
            {errors.birth_date && <small id="correction-birth_date-error" className="correction-error">{errors.birth_date}</small>}
          </label>
        </div>
      </section>

      <section className="correction-section" aria-labelledby="correction-contact-title">
        <div className="correction-section-head">
          <h2 id="correction-contact-title">Kontak & alamat</h2>
          <span>Pastikan petugas dapat menghubungi Anda jika diperlukan.</span>
        </div>
        <div className="correction-grid">
          <label className="correction-field">
            <span>Nomor HP <b aria-hidden="true">*</b></span>
            <input
              id="correction-phone"
              type="tel"
              value={values.phone}
              onChange={(event) => setValue('phone', event.target.value)}
              onBlur={() => validateOne('phone', values.phone)}
              placeholder="Contoh: 081234567890"
              autoComplete="tel"
              inputMode="tel"
              aria-required="true"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'correction-phone-error' : undefined}
            />
            {errors.phone && <small id="correction-phone-error" className="correction-error">{errors.phone}</small>}
          </label>
          <div className="correction-field">
            <span>Wilayah pendaftaran</span>
            <div className="correction-static">{profile?.rt_code || 'RT/RW belum tersedia'}</div>
          </div>
          <label className="correction-field correction-field-full">
            <span>Alamat lengkap <b aria-hidden="true">*</b></span>
            <textarea
              id="correction-address"
              rows={4}
              value={values.address}
              onChange={(event) => setValue('address', event.target.value)}
              onBlur={() => validateOne('address', values.address)}
              placeholder="Jalan, nomor rumah, RT/RW, desa, dan kecamatan"
              autoComplete="street-address"
              aria-required="true"
              aria-invalid={Boolean(errors.address)}
              aria-describedby={errors.address ? 'correction-address-error' : undefined}
            />
            {errors.address && <small id="correction-address-error" className="correction-error">{errors.address}</small>}
          </label>
        </div>
      </section>

      {submitError && (
        <div className="correction-submit-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="correction-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Batalkan</button>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? <><Loader2 size={16} className="spin" /> Mengirim...</> : <><ClipboardCheck size={16} /> Kirim Perbaikan</>}
        </button>
      </div>
      <p className="correction-footnote">Dengan mengirim, status pendaftaran kembali menjadi menunggu verifikasi RT/RW. Data lama Anda tidak hilang.</p>
    </form>
  )
}
