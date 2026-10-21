import { useEffect, useState } from 'react'
import { ArrowLeft, ClipboardPlus, HeartPulse, KeyRound, Printer, RefreshCw, Save, Download, Ban, ShieldCheck, XCircle, AlertTriangle, UserCheck, QrCode } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getCitizen, getRecentExaminations } from '../features/health/healthService'
import {
  adminCorrectCitizenKk,
  adminCorrectCitizenNik,
  adminUpdateCitizenRegistration,
  createActivationCode,
  getActivationStatus,
  getCitizenQrForStaff,
  getStaffCitizenDetail,
  getStaffCitizenIdentity,
  regenerateCitizenQr,
  requestCitizenCorrection,
  revokeCitizenTokens,
  updateStaffCitizen,
  verifyCitizenRegistration,
} from '../features/staff/staffService'
import { issueActivation } from '../features/admin/adminService'
import { IdentityCorrectionModal } from '../components/IdentityCorrectionModal'
import { VerificationModal } from '../components/VerificationModal'
import { maskIdentityNumber } from '../utils/identity'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'

const STATE_LABEL = { active: 'Aktif', expiring: 'Segera kedaluwarsa', expired: 'Kedaluwarsa', used: 'Sudah dipakai', revoked: 'Dicabut', none: '' }
const GENDERS = [['laki-laki', 'Laki-laki'], ['perempuan', 'Perempuan'], ['lainnya', 'Lainnya']]
const RELATIONS = ['kepala keluarga', 'pasangan', 'anak', 'menantu', 'cucu', 'orang tua', 'saudara', 'lainnya']
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const formatDate = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'
const formatDateTime = (value) => value ? new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

const friendlyError = (err, fallback) => {
  const message = err?.message || ''
  if (/Could not find the function|PGRST202|schema cache/i.test(message)) {
    return 'Fitur ini belum aktif di server. Migrasi database terbaru belum dijalankan.'
  }
  return message || fallback
}

const verificationLabel = (status) => ({
  verified: 'Terverifikasi',
  pending: 'Menunggu verifikasi',
  needs_correction: 'Perlu perbaikan',
  rejected: 'Ditolak',
}[status] || 'Status tidak diketahui')

/**
 * Shared citizen detail page for staff (nakes + admin).
 * basePath controls navigation targets and role-specific actions.
 */
export function StaffCitizenDetailPage({ basePath = '/nakes' }) {
  const { citizenId } = useParams()
  const isAdmin = basePath === '/admin'
  const [citizen, setCitizen] = useState(null)
  const [records, setRecords] = useState([])
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [tokenStatus, setTokenStatus] = useState(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [staffQrUrl, setStaffQrUrl] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [actionMode, setActionMode] = useState(null) // reject | correction
  const [actionNote, setActionNote] = useState('')
  const [activation, setActivation] = useState(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [identity, setIdentity] = useState(null)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [identityError, setIdentityError] = useState('')
  const [identityModal, setIdentityModal] = useState(null)
  const [identityBusy, setIdentityBusy] = useState(false)
  const [identitySaveError, setIdentitySaveError] = useState('')

  // Edit form state
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

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
    } catch (err) { setError(friendlyError(err, 'QR belum dapat dibuat ulang.')) } finally { setRegenLoading(false) }
  }

  const loadIdentity = () => {
    if (!isAdmin) return Promise.resolve(null)
    setIdentityLoading(true)
    setIdentityError('')
    return getStaffCitizenIdentity(citizenId)
      .then((nextIdentity) => {
        setIdentity(nextIdentity)
        return nextIdentity
      })
      .catch((err) => {
        setIdentityError(friendlyError(err, 'Identitas lengkap belum dapat dimuat.'))
        return null
      })
      .finally(() => setIdentityLoading(false))
  }

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
    void loadIdentity()
  }

  useEffect(() => { reloadAll() }, [citizenId])

  if (!citizen && !error) return <div className="staff-page"><div className="container narrow-container"><p className="muted-text">Memuat data warga...</p></div></div>
  if (!citizen) return <main className="auth-page"><div className="auth-card"><h1 className="display">Warga tidak ditemukan</h1><p>Data warga tidak tersedia pada sistem.</p><Link className="btn btn-primary btn-wide" to={basePath}>Kembali</Link></div></main>

  const makeCode = async () => {
    setCodeLoading(true)
    try {
      const code = await createActivationCode(citizenId)
      setActivationCode(code)
      setQrUrl(await makeQrDataUrl(`${window.location.origin}/hubungkan-akun?code=${encodeURIComponent(code)}`))
      void getActivationStatus(citizenId).then(setTokenStatus).catch(() => {})
    } catch (err) { setError(friendlyError(err, 'Kode aktivasi belum dapat dibuat.')) } finally { setCodeLoading(false) }
  }

  const doRevoke = async () => {
    try {
      await revokeCitizenTokens(citizenId)
      setActivationCode(''); setQrUrl('')
      void getActivationStatus(citizenId).then(setTokenStatus).catch(() => {})
    } catch (err) { setError(friendlyError(err, 'Kode belum dapat dicabut.')) }
  }

  const startEdit = () => {
    setError(''); setNotice('')
    setEditing({
      citizen_id: citizenId,
      full_name: detail?.full_name ?? citizen.full_name ?? '',
      birth_place: detail?.birth_place ?? '',
      birth_date: detail?.birth_date ?? '',
      gender: detail?.gender ?? '',
      blood_type: detail?.blood_type ?? '',
      family_relation: detail?.family_relation ?? '',
      phone: detail?.phone ?? '',
      address: detail?.address ?? '',
      household_id: detail?.household?.household_id ?? '',
      household_head_name: detail?.household?.head_name ?? '',
      household_address: detail?.household?.address ?? '',
      is_active: detail?.is_active ?? true,
      updated_at: detail?.updated_at ?? null,
    })
  }

  const openIdentityCorrection = (mode) => {
    setIdentitySaveError('')
    setIdentityModal(mode)
  }

  const saveIdentityCorrection = async (value) => {
    if (!identityModal || !identity?.updated_at) return
    setIdentityBusy(true)
    setIdentitySaveError('')
    setError('')
    setNotice('')
    try {
      if (identityModal === 'nik') {
        await adminCorrectCitizenNik(citizenId, value, identity.updated_at)
        setNotice('NIK berhasil diperbarui. Status verifikasi tidak berubah.')
      } else {
        await adminCorrectCitizenKk(citizenId, value, identity.updated_at)
        setNotice('Nomor KK berhasil diperbarui untuk seluruh anggota keluarga. Status verifikasi tidak berubah.')
      }
      const nextIdentity = await getStaffCitizenIdentity(citizenId).catch(() => null)
      if (nextIdentity) setIdentity(nextIdentity)
      setIdentityModal(null)
      reloadAll()
    } catch (err) {
      setIdentitySaveError(friendlyError(err, 'Perubahan identitas belum tersimpan.'))
    } finally {
      setIdentityBusy(false)
    }
  }

  const submitEdit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      if (isAdmin) {
        const payload = { ...editing }
        delete payload.nik
        delete payload.household_number
        await adminUpdateCitizenRegistration(payload)
        setNotice('Perubahan data tersimpan. Status verifikasi tidak berubah - periksa ulang lalu verifikasi secara terpisah.')
      } else {
        await updateStaffCitizen(editing)
        setNotice('Perubahan data dasar tersimpan.')
      }
      setEditing(null)
      reloadAll()
    } catch (err) {
      setError(friendlyError(err, 'Perubahan belum tersimpan.'))
    } finally {
      setSaving(false)
    }
  }

  const doVerify = async () => {
    setActionBusy('verify'); setError(''); setNotice(''); setVerifyError('')
    try {
      await verifyCitizenRegistration(citizenId, true)
      setVerifyOpen(false)
      setNotice('Pendaftaran terverifikasi. Terbitkan QR aktivasi agar warga dapat membuka akun.')
      setActivation(null)
      reloadAll()
    } catch (err) {
      setVerifyError(friendlyError(err, 'Verifikasi belum berhasil.'))
    } finally {
      setActionBusy('')
    }
  }

  const submitAction = async () => {
    const note = actionNote.trim()
    if (!note) return setError('Catatan wajib diisi.')
    setActionBusy(actionMode); setError(''); setNotice('')
    try {
      if (actionMode === 'correction') {
        await requestCitizenCorrection(citizenId, note)
        setNotice('Permintaan perbaikan dikirim. Warga dapat memperbaiki data dan mengirim ulang.')
      } else {
        await verifyCitizenRegistration(citizenId, false, note)
        setNotice('Pendaftaran ditolak dengan alasan yang tercatat.')
      }
      setActionMode(null); setActionNote('')
      reloadAll()
    } catch (err) {
      setError(friendlyError(err, 'Aksi belum berhasil.'))
    } finally {
      setActionBusy('')
    }
  }

  const doIssueActivation = async () => {
    setActionBusy('activation'); setError(''); setNotice('')
    try {
      const act = await issueActivation(citizenId)
      const url = await makeQrDataUrl(`${window.location.origin}/warga/aktivasi?t=${encodeURIComponent(act.token)}`, 320)
      setActivation({ ...act, url })
      setNotice('QR aktivasi dibuat. Minta warga scan QR atau masukkan kode manual. Berlaku 30 menit dan sekali pakai.')
      reloadAll()
    } catch (err) {
      setError(friendlyError(err, 'QR aktivasi belum dapat dibuat.'))
    } finally {
      setActionBusy('')
    }
  }

  const google = detail?.google
  const verificationStatus = detail?.verification_status
  const activated = Boolean(detail?.activated_at)
  const canReview = verificationStatus === 'pending' || verificationStatus === 'needs_correction'
  const statusColor = verificationStatus === 'verified' ? '#16a34a'
    : verificationStatus === 'needs_correction' ? '#b45309'
    : verificationStatus === 'rejected' ? '#b42318' : '#6b7280'

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
              {verificationStatus && <span className="badge" style={{ borderColor: statusColor, color: statusColor }}>{verificationLabel(verificationStatus)}</span>}
              {verificationStatus === 'verified' && <span className="badge">{activated ? 'Akun aktif' : 'Belum aktivasi'}</span>}
              {google && (
                <span className="badge">{google.connected ? `Akun Google terhubung${google.email ? ` · ${google.email}` : ''}` : 'Belum terhubung akun Google'}</span>
              )}
              {detail && <span className="badge">Status data: <strong>{detail.is_active === false ? 'Tidak aktif' : 'Aktif'}</strong></span>}
            </div>
            {verificationStatus === 'needs_correction' && detail?.verification_note && (
              <p className="muted-text" style={{ marginTop: 8 }}><strong>Catatan perbaikan:</strong> {detail.verification_note}</p>
            )}
          </div>
          <div className="citizen-hero-actions">
            {basePath === '/nakes' && verificationStatus === 'verified' && activated && <Link className="btn btn-primary" to={`/nakes/pemeriksaan/baru?citizen=${citizen.citizen_id}`}><ClipboardPlus size={17} /> Mulai pemeriksaan</Link>}
            {(isAdmin || basePath === '/nakes') && <button type="button" className="btn btn-ghost" onClick={startEdit}>Ubah Data</button>}
          </div>
        </div>

        {notice && <div className="staff-alert" role="status" style={{ background: '#f0faf7', borderColor: '#bfe3da', color: 'var(--teal-dark)' }}><UserCheck size={17} /> {notice}</div>}
        {error && <div className="staff-alert" role="alert"><AlertTriangle size={17} /> {error}<button className="btn btn-ghost" onClick={() => setError('')}><RefreshCw size={15} /></button></div>}

        {isAdmin && (
          <section className="staff-panel" style={{ marginBottom: 14 }}>
            <div className="staff-panel-head">
              <div><h2>Pemeriksaan pendaftaran</h2><p>Periksa seluruh data, perbaiki bila perlu, lalu putuskan secara terpisah.</p></div>
              <ShieldCheck size={19} color="var(--teal)" />
            </div>

            {canReview && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" disabled={Boolean(actionBusy)} onClick={() => { setVerifyError(''); setVerifyOpen(true) }}>
                    <ShieldCheck size={15} /> Verifikasi Warga
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={Boolean(actionBusy)} onClick={() => { setActionMode('correction'); setActionNote(''); setError('') }}>
                    <AlertTriangle size={15} /> Minta Perbaikan
                  </button>
                  <button type="button" className="btn btn-danger" disabled={Boolean(actionBusy)} onClick={() => { setActionMode('reject'); setActionNote(''); setError('') }}>
                    <XCircle size={15} /> Tolak Pendaftaran
                  </button>
                </div>

                {actionMode && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    <label style={{ fontWeight: 700, fontSize: 13 }}>
                      {actionMode === 'reject' ? 'Alasan penolakan (wajib)' : 'Catatan perbaikan untuk warga (wajib)'}
                      <textarea
                        rows={3}
                        value={actionNote}
                        onChange={(event) => setActionNote(event.target.value)}
                        placeholder={actionMode === 'reject' ? 'Contoh: NIK tidak sesuai dengan KTP.' : 'Contoh: Mohon perbaiki nomor KK dan alamat sesuai kartu keluarga.'}
                        style={{ width: '100%', marginTop: 6 }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary" disabled={Boolean(actionBusy) || !actionNote.trim()} onClick={() => void submitAction()}>
                        {actionBusy ? 'Mengirim...' : actionMode === 'reject' ? 'Kirim Penolakan' : 'Kirim Permintaan Perbaikan'}
                      </button>
                      <button type="button" className="btn btn-ghost" disabled={Boolean(actionBusy)} onClick={() => { setActionMode(null); setActionNote('') }}>Batal</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {verificationStatus === 'rejected' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <p className="muted-text" style={{ margin: 0 }}>Pendaftaran ditolak{detail?.verification_note ? `: ${detail.verification_note}` : '.'} Minta warga memperbaiki data agar dapat diperiksa ulang.</p>
                <div><button type="button" className="btn btn-ghost" onClick={() => { setActionMode('correction'); setActionNote(''); setError('') }}><AlertTriangle size={15} /> Minta Perbaikan</button></div>
                {actionMode === 'correction' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea rows={3} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Catatan perbaikan (wajib)" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-primary" disabled={Boolean(actionBusy) || !actionNote.trim()} onClick={() => void submitAction()}>Kirim</button>
                      <button type="button" className="btn btn-ghost" onClick={() => { setActionMode(null); setActionNote('') }}>Batal</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {verificationStatus === 'verified' && !activated && (
              <div style={{ display: 'grid', gap: 10 }}>
                <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={Boolean(actionBusy)} onClick={() => void doIssueActivation()}>
                  <QrCode size={15} /> {actionBusy === 'activation' ? 'Membuat QR...' : 'Terbitkan QR Aktivasi'}
                </button>
                {activation && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 12 }}>
                    <img src={activation.url} alt="QR aktivasi akun" style={{ width: 190, borderRadius: 10 }} />
                    <div>
                      <strong>QR AKTIVASI AKUN</strong>
                      <div style={{ margin: '8px 0', padding: '8px 10px', background: '#f0faf7', border: '1px dashed #9ddbd0', borderRadius: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Kode manual</div>
                        <strong style={{ fontSize: 22, letterSpacing: 3 }}>{activation.code}</strong>
                      </div>
                      <p style={{ margin: '4px 0', fontSize: 12.5 }}>Berlaku 30 menit dan sekali pakai.</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost" onClick={() => downloadQr(activation.url, `qr-aktivasi-${citizenId}.png`)}><Download size={15} /> Unduh</button>
                        <button type="button" className="btn btn-ghost" onClick={() => printQr(activation.url, 'Aktivasi Akun Warga', `Kode manual: ${activation.code}`)}><Printer size={15} /> Cetak</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {verificationStatus === 'verified' && activated && (
              <p className="muted-text" style={{ margin: 0 }}>Warga sudah menyelesaikan aktivasi pada {formatDateTime(detail?.activated_at)}.</p>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="staff-panel identity-panel" style={{ marginBottom: 14 }}>
            <div className="staff-panel-head">
              <div><h2>Identitas Warga</h2><p>NIK dan nomor KK lengkap hanya untuk admin RT/RW dan Developer.</p></div>
              <ShieldCheck size={19} color="var(--teal)" />
            </div>

            {identityError && (
              <div className="identity-error" role="alert">
                <AlertTriangle size={16} />
                <span>{identityError}</span>
                <button type="button" className="btn btn-ghost" onClick={() => void loadIdentity()} disabled={identityLoading}>
                  <RefreshCw size={14} /> Muat ulang
                </button>
              </div>
            )}

            {!identity && identityLoading && <p className="muted-text" style={{ margin: 0 }}>Memuat identitas lengkap...</p>}

            {identity && (
              <>
                <div className="identity-grid">
                  <article className="identity-card">
                    <div className="identity-card-head"><span>NIK</span><ShieldCheck size={17} /></div>
                    <strong className="identity-value">
                      {identity.nik_available ? identity.nik_full : maskIdentityNumber(identity.nik_last4)}
                    </strong>
                    <p>
                      {identity.nik_available
                        ? 'NIK lengkap tersimpan pada penyimpanan privat.'
                        : 'NIK lengkap belum tersedia untuk data lama. Masukkan ulang sesuai KTP.'}
                    </p>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openIdentityCorrection('nik')}
                      disabled={identityBusy || identityLoading || !identity.updated_at}
                    >
                      Edit NIK
                    </button>
                  </article>

                  <article className="identity-card">
                    <div className="identity-card-head"><span>Nomor KK</span><ShieldCheck size={17} /></div>
                    <strong className="identity-value">{identity.household_number}</strong>
                    <p>Berlaku untuk seluruh anggota KK di {identity.rt_code || 'RT ini'}. Relasi keluarga tidak berubah.</p>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openIdentityCorrection('kk')}
                      disabled={identityBusy || identityLoading || !identity.updated_at}
                    >
                      Edit Nomor KK
                    </button>
                  </article>
                </div>
                <div className="identity-footnote">
                  <span>Perubahan identitas tidak otomatis memverifikasi pendaftaran.</span>
                  <Link to="/admin/kk">Kelola data KK</Link>
                </div>
              </>
            )}
          </section>
        )}

        <section className="staff-panel" style={{ marginBottom: 14 }}>
          <div className="staff-panel-head">
            <div><h2>Data pendaftaran</h2><p>Seluruh field yang tersimpan saat registrasi.</p></div>
            <UserCheck size={19} color="var(--teal)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            <div>
              <div className="eyebrow">Identitas</div>
              <p style={{ margin: '6px 0 0', lineHeight: 1.8 }}>
                <strong>{detail?.full_name ?? citizen.full_name}</strong><br />
                {!isAdmin && <>NIK: {maskIdentityNumber(detail?.nik_last4 ?? citizen.nik_last4)}<br /></>}
                {!isAdmin && <>KK: {detail?.household?.household_number ?? citizen.household_number}<br /></>}
                Tempat lahir: {detail?.birth_place || '-'}<br />
                Tanggal lahir: {formatDate(detail?.birth_date)}<br />
                Jenis kelamin: {GENDERS.find(([value]) => value === detail?.gender)?.[1] || detail?.gender || '-'}<br />
                Golongan darah: {detail?.blood_type || '-'}<br />
                Hubungan keluarga: {detail?.family_relation || '-'}
              </p>
            </div>
            <div>
              <div className="eyebrow">Alamat & wilayah</div>
              <p style={{ margin: '6px 0 0', lineHeight: 1.8 }}>
                Alamat warga: {detail?.address || '-'}<br />
                Alamat KK: {detail?.household?.address || '-'}<br />
                RT: {detail?.household?.rt_code ?? citizen.rt_code}<br />
                Kepala keluarga: {detail?.household?.head_name || '-'}
              </p>
            </div>
            <div>
              <div className="eyebrow">Kontak & status</div>
              <p style={{ margin: '6px 0 0', lineHeight: 1.8 }}>
                Telepon: {detail?.phone || '-'}<br />
                Email: {google?.email || (google?.connected ? 'Terhubung' : 'Belum terhubung')}<br />
                Terdaftar: {formatDateTime(detail?.created_at)}<br />
                Verifikasi: {verificationLabel(verificationStatus)}<br />
                Aktivasi: {activated ? `Selesai ${formatDateTime(detail?.activated_at)}` : verificationStatus === 'verified' ? 'Belum aktivasi' : '-'}
              </p>
            </div>
          </div>
          {detail?.verification_note && (
            <p style={{ margin: '10px 0 0', fontSize: 13 }}><strong>Catatan verifikasi:</strong> {detail.verification_note}</p>
          )}
          {!isAdmin && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>NIK lengkap tidak ditampilkan untuk peran ini.</p>}
        </section>

        {verificationStatus === 'verified' && (
          <div className="qr-section" style={{ marginBottom: 14 }}>
            {staffQrUrl ? (
              <>
                <img src={staffQrUrl} alt="QR warga" className="qr-image" />
                <button type="button" className="btn btn-ghost" onClick={() => downloadQr(staffQrUrl, `qr-${citizenId}.png`)}><Download size={15} /> Unduh</button>
                <button type="button" className="btn btn-danger" onClick={() => void doRegenerate()} disabled={regenLoading}>{regenLoading ? 'Membuat ulang...' : 'Regenerate QR (QR lama invalid)'}</button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => void loadStaffQr()}><QrCode size={15} /> Lihat QR Warga</button>
            )}
          </div>
        )}

        {verificationStatus === 'verified' && !google?.connected && (
          <div className="activation-section" style={{ marginBottom: 14 }}>
            {tokenStatus && tokenStatus.state !== 'none' && (
              <span className="token-badge">Kode hubungkan akun: {STATE_LABEL[tokenStatus.state] || tokenStatus.state}</span>
            )}
            {activationCode ? (
              <>
                <span className="activation-code">{activationCode}</span>
                <small className="activation-note">Berlaku 15 menit dan sekali pakai. Gunakan untuk menghubungkan akun Google warga.</small>
                {qrUrl && <img src={qrUrl} alt="QR hubungkan akun" className="qr-image qr-image-sm" />}
                <div className="activation-actions">
                  {qrUrl && <button type="button" className="btn btn-ghost" onClick={() => downloadQr(qrUrl, `qr-hubungkan-${citizenId}.png`)}><Download size={15} /> Unduh QR</button>}
                  {qrUrl && <button type="button" className="btn btn-ghost" onClick={() => printQr(qrUrl, 'Hubungkan Akun Warga', `${citizen.full_name} - kode ${activationCode}`)}><Printer size={15} /> Cetak</button>}
                  <button type="button" className="btn btn-ghost" onClick={() => void doRevoke()}><Ban size={15} /> Cabut kode</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => void makeCode()} disabled={codeLoading}><KeyRound size={15} /> {codeLoading ? 'Membuat kode...' : 'Buat Kode Hubungkan Akun'}</button>
            )}
          </div>
        )}

        {editing && (
          <form className="admin-form" onSubmit={submitEdit} style={{ marginBottom: 14 }}>
            <h2>{isAdmin ? 'Ubah data pendaftaran' : 'Ubah data dasar warga'}</h2>
            <div className="field-grid">
              <label>Nama lengkap<input required value={editing.full_name ?? ''} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} /></label>
              <label>Kontak<input value={editing.phone ?? ''} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
            </div>
            {isAdmin && (
              <>
                <div className="field-grid">
                  <label>Tempat lahir<input value={editing.birth_place ?? ''} onChange={(event) => setEditing({ ...editing, birth_place: event.target.value })} /></label>
                  <label>Tanggal lahir<input type="date" value={editing.birth_date ?? ''} onChange={(event) => setEditing({ ...editing, birth_date: event.target.value })} /></label>
                </div>
                <div className="field-grid">
                  <label>Kepala keluarga<input value={editing.household_head_name ?? ''} onChange={(event) => setEditing({ ...editing, household_head_name: event.target.value })} /></label>
                  <label>Alamat KK<input value={editing.household_address ?? ''} onChange={(event) => setEditing({ ...editing, household_address: event.target.value })} /></label>
                </div>
                <label>Alamat warga<textarea rows={2} value={editing.address ?? ''} onChange={(event) => setEditing({ ...editing, address: event.target.value })} /></label>
              </>
            )}
            <div className="field-grid">
              <label>Jenis kelamin<select value={editing.gender ?? ''} onChange={(event) => setEditing({ ...editing, gender: event.target.value })}><option value="">Pilih</option>{GENDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Golongan darah<select value={editing.blood_type ?? ''} onChange={(event) => setEditing({ ...editing, blood_type: event.target.value })}><option value="">Pilih</option>{BLOOD_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            </div>
            {isAdmin && (
              <div className="field-grid">
                <label>Hubungan keluarga<select value={editing.family_relation ?? ''} onChange={(event) => setEditing({ ...editing, family_relation: event.target.value })}><option value="">Pilih</option>{RELATIONS.map((relation) => <option key={relation} value={relation}>{relation}</option>)}</select></label>
                <label className="check-row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(editing.is_active)} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} /> <span>Data aktif</span></label>
              </div>
            )}
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

        <VerificationModal
          open={verifyOpen}
          citizen={{
            full_name: detail?.full_name ?? citizen.full_name,
            nik_last4: detail?.nik_last4 ?? citizen.nik_last4,
            rt_code: detail?.household?.rt_code ?? citizen.rt_code,
            household_number: detail?.household?.household_number ?? citizen.household_number,
            verification_status: verificationStatus,
          }}
          busy={actionBusy === 'verify'}
          error={verifyError}
          onClose={() => { if (actionBusy !== 'verify') { setVerifyOpen(false); setVerifyError('') } }}
          onConfirm={() => void doVerify()}
        />

        <IdentityCorrectionModal
          open={Boolean(identityModal)}
          mode={identityModal || 'nik'}
          citizenName={detail?.full_name ?? citizen.full_name}
          initialValue={identityModal === 'nik'
            ? (identity?.nik_available ? identity.nik_full : '')
            : (identity?.household_number || '')}
          busy={identityBusy}
          error={identitySaveError}
          onClose={() => { if (!identityBusy) { setIdentityModal(null); setIdentitySaveError('') } }}
          onConfirm={(value) => void saveIdentityCorrection(value)}
        />
      </div>
    </div>
  )
}
