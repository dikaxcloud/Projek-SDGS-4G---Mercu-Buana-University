import { useEffect, useState } from 'react'
import { ArrowLeft, ClipboardPlus, HeartPulse, KeyRound, Printer, RefreshCw, Save, Download, Ban } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getCitizen, getRecentExaminations } from '../features/health/healthService'
import { createActivationCode, getActivationStatus, getCitizenQrForStaff, getStaffCitizenDetail, regenerateCitizenQr, revokeCitizenTokens, updateStaffCitizen } from '../features/staff/staffService'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'
const STATE_LABEL = { active: '🟢 Aktif', expiring: '🟡 Segera kedaluwarsa', expired: '🔴 Kedaluwarsa', used: '🔴 Sudah dipakai', revoked: '🔴 Dicabut', none: '' }

/**
 * Shared citizen detail page for staff (nakes + admin).
 * basePath controls navigation targets and role-specific actions.
 */
export function StaffCitizenDetailPage({ basePath = '/nakes' }) {
  const { citizenId } = useParams()
  const [citizen, setCitizen] = useState(null)
  const [records, setRecords] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [tokenStatus, setTokenStatus] = useState(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [staffQrUrl, setStaffQrUrl] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)

  const loadStaffQr = async () => {
    try {
      const res = await getCitizenQrForStaff(citizenId)
      if (res?.state === 'ready') setStaffQrUrl(await makeQrDataUrl(`DSK1:${res.token}`, 240))
    } catch { setError('QR warga belum dapat dimuat.') }
  }
  const doRegenerate = async () => {
    setRegenLoading(true)
    try {
      await regenerateCitizenQr(citizenId)
      await loadStaffQr()
    } catch (err) { setError(err.message || 'QR belum dapat dibuat ulang.') } finally { setRegenLoading(false) }
  }
  // Edit form state
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const reloadAll = () => {
    void Promise.all([getCitizen(citizenId), getRecentExaminations(citizenId)])
      .then(([nextCitizen, nextRecords]) => { setCitizen(nextCitizen); setRecords(nextRecords) })
      .catch(() => setError('Data warga belum dapat dimuat.'))
    void getStaffCitizenDetail(citizenId)
      .then((nextDetail) => setDetail(nextDetail))
      .catch(() => {})
    void getActivationStatus(citizenId)
      .then((status) => setTokenStatus(status))
      .catch(() => {})
  }

  useEffect(() => { reloadAll() }, [citizenId])

  if (!citizen && !error) return <div className="staff-page"><div className="container narrow-container"><p className="muted-text">Memuat data warga...</p></div></div>
  if (!citizen) return <main className="auth-page"><div className="auth-card"><h1 className="display">Warga tidak ditemukan</h1><p>Data warga tidak tersedia pada sistem.</p><Link className="btn btn-primary btn-wide" to={basePath}>Kembali</Link></div></main>

  const reload = () => getRecentExaminations(citizenId).then(setRecords).catch(() => setError('Riwayat belum dapat dimuat.'))

  const makeCode = async () => {
    setCodeLoading(true)
    try {
      const code = await createActivationCode(citizenId)
      setActivationCode(code)
      setQrUrl(await makeQrDataUrl(`${window.location.origin}/hubungkan-akun?code=${encodeURIComponent(code)}`))
      void getActivationStatus(citizenId).then(setTokenStatus).catch(() => {})
    } catch { setError('Kode aktivasi belum dapat dibuat.') } finally { setCodeLoading(false) }
  }

  const doRevoke = async () => {
    try {
      await revokeCitizenTokens(citizenId)
      setActivationCode(''); setQrUrl('')
      void getActivationStatus(citizenId).then(setTokenStatus).catch(() => {})
    } catch { setError('Kode belum dapat dicabut.') }
  }

  const startEdit = () => {
    setEditing({
      citizen_id: citizenId,
      full_name: detail?.full_name ?? citizen.full_name ?? '',
      phone: detail?.phone ?? '',
      birth_date: detail?.birth_date ?? '',
      gender: detail?.gender ?? '',
      blood_type: detail?.blood_type ?? '',
      is_active: detail?.is_active ?? true,
    })
  }

  const submitEdit = async (event) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await updateStaffCitizen(editing)
      setEditing(null)
      reloadAll()
    } catch (err) {
      setError(err.message || 'Perubahan belum tersimpan.')
    } finally { setSaving(false) }
  }

  const google = detail?.google
  const verificationStatus = detail?.verification_status
  const verificationLabel = verificationStatus === 'verified' ? '🟢 Terverifikasi' : verificationStatus === 'rejected' ? `🔴 Ditolak${detail.verification_note ? ` — ${detail.verification_note}` : ''}` : '⏳ Menunggu verifikasi'

  return (
    <div className="staff-page">
      <div className="container narrow-container">
        <Link className="back-link" to={basePath}><ArrowLeft size={15} /> Kembali ke ringkasan</Link>
        <div className="citizen-hero">
          <div className="avatar large">{citizen.full_name.slice(0, 1)}</div>
          <div className="citizen-hero-content">
            <div className="eyebrow">Profil warga</div>
            <h1 className="display">{citizen.full_name}</h1>
            <p className="citizen-meta">{citizen.rt_code} · {citizen.household_number} · NIK ****{citizen.nik_last4}</p>
            <div className="citizen-badges">
              {verificationStatus && <span className="badge">{verificationLabel}</span>}
              {google && (
                <span className="badge">{google.connected ? `🟢 Akun Google terhubung${google.email ? ` · ${google.email}` : ''}` : '🟡 Belum terhubung akun Google.'}</span>
              )}
              {detail && <span className="badge">Status: <strong>{detail.is_active === false ? 'Tidak aktif' : 'Aktif'}</strong>{detail.family_relation ? ` · ${detail.family_relation}` : ''}</span>}
            </div>

            {/* Citizen health QR (staff view / regenerate) */}
            {verificationStatus === 'verified' && (
              <div className="qr-section">
                {staffQrUrl ? (
                  <>
                    <img src={staffQrUrl} alt="QR warga" className="qr-image" />
                    <button type="button" className="btn btn-ghost" onClick={() => downloadQr(staffQrUrl, `qr-${citizenId}.png`)}><Download size={15} /> Unduh</button>
                    <button type="button" className="btn btn-danger" onClick={() => void doRegenerate()} disabled={regenLoading}>{regenLoading ? 'Membuat ulang...' : 'Regenerate QR (QR lama invalid)'}</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => void loadStaffQr()}>Lihat QR Warga</button>
                )}
              </div>
            )}

            {!google?.connected && (
              <div className="activation-section">
                {tokenStatus && tokenStatus.state !== 'none' && (
                  <span className="token-badge">Kode terakhir: {STATE_LABEL[tokenStatus.state] || tokenStatus.state}</span>
                )}
                {activationCode ? (
                  <>
                    <span className="activation-code">{activationCode}</span>
                    <small className="activation-note">Berlaku 15 menit & sekali pakai. Minta warga scan QR ini atau masukkan kode di halaman Hubungkan Akun.</small>
                    {qrUrl && <img src={qrUrl} alt="QR aktivasi" className="qr-image qr-image-sm" />}
                    <div className="activation-actions">
                      {qrUrl && <button type="button" className="btn btn-ghost" onClick={() => downloadQr(qrUrl, `qr-aktivasi-${citizenId}.png`)}><Download size={15} /> Unduh QR</button>}
                      {qrUrl && <button type="button" className="btn btn-ghost" onClick={() => printQr(qrUrl, `Aktivasi Akun Warga`, `${citizen.full_name} — kode ${activationCode}`)}><Printer size={15} /> Cetak</button>}
                      <button type="button" className="btn btn-ghost" onClick={() => void doRevoke()}><Ban size={15} /> Cabut kode</button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => void makeCode()} disabled={codeLoading}><KeyRound size={15} /> {codeLoading ? 'Membuat kode...' : 'Buat Kode Aktivasi / QR'}</button>
                )}
              </div>
            )}
          </div>
          <div className="citizen-hero-actions">
            {basePath === '/nakes' && <Link className="btn btn-primary" to={`/nakes/pemeriksaan/baru?citizen=${citizen.citizen_id}`}><ClipboardPlus size={17} /> Mulai pemeriksaan</Link>}
            <button type="button" className="btn btn-ghost" onClick={startEdit}>Ubah Data Warga</button>
          </div>
        </div>

        {error && <div className="staff-alert"><span>{error}</span><button className="btn btn-ghost" onClick={() => setError('')}><RefreshCw size={15} /></button></div>}

        {editing && (
          <form className="admin-form" onSubmit={submitEdit} style={{ marginBottom: 14 }}>
            <h2>Ubah data dasar warga</h2>
            <div className="field-grid">
              <label>Nama lengkap<input required value={editing.full_name ?? ''} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} /></label>
              <label>Kontak<input value={editing.phone ?? ''} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
            </div>
            <div className="field-grid">
              <label>Tanggal lahir<input type="date" value={editing.birth_date ?? ''} onChange={(event) => setEditing({ ...editing, birth_date: event.target.value })} /></label>
              <label>Jenis kelamin<select value={editing.gender ?? ''} onChange={(event) => setEditing({ ...editing, gender: event.target.value })}><option value="">Pilih</option><option value="laki-laki">Laki-laki</option><option value="perempuan">Perempuan</option></select></label>
            </div>
            <div className="field-grid">
              <label>Golongan darah<select value={editing.blood_type ?? ''} onChange={(event) => setEditing({ ...editing, blood_type: event.target.value })}><option value="">Pilih</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="check-row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(editing.is_active)} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} /> <span>Data aktif</span></label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </form>
        )}

        <section className="staff-panel">
          <div className="staff-panel-head"><div><h2>Riwayat pemeriksaan</h2><p>Gunakan sebagai bahan pemantauan, bukan diagnosis.</p></div><HeartPulse size={19} color="var(--teal)" /></div>
          {records.length === 0 ? <p className="muted-text">Belum ada pemeriksaan.</p> : (
            <div className="record-table">{records.map((record) => (
              <div className="record-row" key={record.health_record_id}>
                <div><strong>{record.type || 'Pemeriksaan kesehatan'}</strong><small>{new Date(record.examined_at).toLocaleDateString('id-ID')}</small></div>
                <span>{record.summary || 'Catatan tersedia'}</span>
                {record.needs_follow_up && <span className="follow-up">Perlu diperiksa kembali</span>}
              </div>
            ))}</div>
          )}
        </section>
      </div>
    </div>
  )
}