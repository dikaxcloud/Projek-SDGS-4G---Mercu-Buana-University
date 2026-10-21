import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp, Download, KeyRound, Plus, Printer, RefreshCw, Save, Search, ShieldCheck, Trash2, UserX, UserCheck, UserX as UserXIcon, Wifi, WifiOff, Shield, Mail, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { deleteAdminResource, getDemoAdminRows, inviteUser, issueActivation, listAdmin, moveAdminContact, saveAdmin, setUserRoleByEmail } from '../features/admin/adminService'
import { ROLES, ROLE_COLORS, assignableRoles, canChangeRole, canDeleteRole, invitableRoles, roleLabel } from '../features/auth/roles'
import { createStaffHousehold, createAdminRt, listHouseholdMembers, listStaffCitizens, listStaffHouseholds, listStaffRts, updateAdminRt } from '../features/staff/staffService'
import { downloadQr, makeQrDataUrl, printQr } from '../utils/qr'
import { useAuth } from '../features/auth/AuthProvider'
import { subscribeToCitizenChanges } from '../lib/realtime'

const statusBadge = (label, color, icon) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: color + '15', color, border: `1px solid ${color}40` }}>
    {icon && <icon size={10} />}
    {label}
  </span>
)

const config = {
  citizens: {
    title: 'Warga',
    description: 'Identitas warga selalu ditampilkan terbatas.',
    columns: [
      ['full_name', 'Nama'],
      ['nik_last4', 'NIK akhir'],
      ['household_number', 'KK'],
      ['rt_code', 'RT'],
      ['created_at', 'Terdaftar'],
      ['verification_status', 'Verifikasi'],
      ['activation_status', 'Aktivasi'],
    ],
    renderCell: (key, value, row) => {
      if (key === 'created_at') return value ? new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
      if (key === 'verification_status') {
        const map = {
          verified: ['Terverifikasi', '#16a34a', UserCheck],
          needs_correction: ['Perlu perbaikan', '#b45309', AlertTriangle],
          pending: ['Menunggu verifikasi', '#f59e0b', AlertTriangle],
          rejected: ['Ditolak', '#ef4444', UserXIcon],
        }
        const [label, color, Icon] = map[value] || ['Belum', '#6b7280', UserXIcon]
        return statusBadge(label, color, Icon)
      }
      if (key === 'activation_status') {
        const map = {
          activated: ['Aktif', '#16a34a', UserCheck],
          pending_activation: ['Belum aktivasi', '#b45309', AlertTriangle],
          needs_correction: ['Perbaikan', '#b45309', AlertTriangle],
          rejected: ['Ditolak', '#ef4444', UserXIcon],
          pending: ['Menunggu', '#f59e0b', AlertTriangle],
        }
        const [label, color, Icon] = map[value] || ['-', '#6b7280', null]
        return statusBadge(label, color, Icon)
      }
      return String(value || '-')
    }
  },
  households: {
    title: 'KK',
    description: 'Daftar kepala keluarga dan jumlah warga.',
    columns: [['household_number', 'Nomor KK'], ['head_name', 'Kepala keluarga'], ['rt_code', 'RT'], ['address', 'Alamat'], ['citizen_count', 'Jumlah warga']],
  },
  rts: {
    title: 'RT',
    description: 'Ringkasan wilayah dan jumlah data.',
    columns: [['code', 'Kode'], ['name', 'Nama'], ['household_count', 'Jumlah KK'], ['citizen_count', 'Jumlah warga']],
  },
  health_workers: {
    title: 'Nakes',
    description: 'Kelola petugas kesehatan desa.',
    columns: [['full_name', 'Nama'], ['position', 'Jabatan'], ['specialty', 'Bidang'], ['phone', 'Kontak'], ['is_online', 'Online'], ['is_active', 'Status']],
    form: 'worker',
    renderCell: (key, value, row) => {
      if (key === 'is_online') return statusBadge(value ? 'Online' : 'Offline', value ? '#16a34a' : '#6b7280', value ? Wifi : WifiOff)
      if (key === 'is_active') return statusBadge(value ? 'Aktif' : 'Tidak aktif', value ? '#16a34a' : '#ef4444', value ? UserCheck : UserXIcon)
      return String(value || '—')
    }
  },
  profiles: {
    title: 'Akun',
    description: '',
    columns: [['display_name', 'Nama'], ['email', 'Email Google'], ['role', 'Role'], ['is_active', 'Status']],
    roleControl: true,
    renderCell: (key, value) => {
      if (key === 'role') return statusBadge(roleLabel(value), ROLE_COLORS[value] ?? '#6b7280', Shield)
      if (key === 'is_active') return statusBadge(value ? 'Aktif' : 'Tidak aktif', value ? '#16a34a' : '#ef4444', value ? UserCheck : UserXIcon)
      return String(value || '—')
    }
  },
  articles: {
    title: 'Informasi kesehatan',
    description: 'Kelola artikel edukasi non-diagnostik. Arsip untuk menyembunyikan dari publik.',
    columns: [['title', 'Judul'], ['category', 'Kategori'], ['is_published', 'Status'], ['updated_at', 'Diperbarui']],
    form: 'article',
    renderCell: (key, value) => {
      if (key === 'is_published') return statusBadge(value ? 'Terbit' : 'Draft', value ? '#16a34a' : '#6b7280')
      if (key === 'updated_at' && value) return new Date(value).toLocaleString('id-ID')
      return String(value || '—')
    }
  },
  emergency_contacts: {
    title: 'Kontak darurat',
    description: 'Nomor bantuan darurat yang tampil ke warga. Tautan WhatsApp dibuat otomatis dari nomor.',
    columns: [['officer_name', 'Petugas'], ['label', 'Label'], ['phone', 'Telepon'], ['is_active', 'Status']],
    form: 'contact',
    contactActions: true,
    renderCell: (key, value) => {
      if (key === 'is_active') return statusBadge(value ? 'Aktif' : 'Tidak aktif', value ? '#16a34a' : '#ef4444')
      return String(value || '—')
    }
  },
  audit_logs: {
    title: 'Audit log',
    description: 'Catatan perubahan operasional. Metadata tidak berisi NIK lengkap.',
    columns: [['created_at', 'Waktu'], ['action', 'Aksi'], ['entity', 'Entitas'], ['actor_user_id', 'Pelaku'], ['metadata', 'Metadata']],
    renderCell: (key, value) => {
      if (key === 'created_at' && value) return new Date(value).toLocaleString('id-ID')
      if (key === 'metadata') return JSON.stringify(value, null, 2)
      return String(value || '—')
    }
  },
}

const CITIZEN_TABS = [
  { key: 'incoming', label: 'Pendaftaran Masuk', match: (row) => row.verification_status === 'pending' || row.verification_status === 'needs_correction' },
  { key: 'correction', label: 'Perlu Perbaikan', match: (row) => row.verification_status === 'needs_correction' },
  { key: 'rejected', label: 'Ditolak', match: (row) => row.verification_status === 'rejected' },
  { key: 'pending_activation', label: 'Belum Aktivasi', match: (row) => row.verification_status === 'verified' && !row.activated_at },
  { key: 'active', label: 'Warga Aktif', match: (row) => row.verification_status === 'verified' && Boolean(row.activated_at) && row.is_active !== false },
  { key: 'inactive', label: 'Dinonaktifkan', match: (row) => row.is_active === false },
  { key: 'all', label: 'Semua', match: () => true },
]

export function AdminManagementPage({ resource }) {
  const meta = config[resource]
  const navigate = useNavigate()
  const { access } = useAuth()
  const callerRole = access?.role ?? null
  const isDeveloper = callerRole === ROLES.DEVELOPER
  const [rows, setRows] = useState([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState(null)
  const [citizenTab, setCitizenTab] = useState('incoming')
  const [rtFilter, setRtFilter] = useState('')
  const [rts, setRts] = useState([])
  const [accountRoleFilter, setAccountRoleFilter] = useState('')
  const [kkForm, setKkForm] = useState(null); const [kkSaving, setKkSaving] = useState(false); const [members, setMembers] = useState(null)
  const [rtForm, setRtForm] = useState(null); const [rtSaving, setRtSaving] = useState(false)
  const [codeInfo, setCodeInfo] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')

  // Toast state
  const [toasts, setToasts] = useState([])
  const pushToast = (type, text) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, type, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800)
  }

  const load = async () => {
    setLoading(true); setError('')
    try {
      if (resource === 'citizens') {
        const [rowsData, rtsData] = await Promise.all([listStaffCitizens({ query, rt: rtFilter, status: '', limit: 100 }), listStaffRts()])
        setRows(rowsData ?? []); setRts(rtsData ?? [])
      } else if (resource === 'households') {
        setRows(await listStaffHouseholds(query))
      } else {
        setRows(await listAdmin(resource, query))
      }
    } catch (err) { setError(err.message || 'Data belum dapat dimuat.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [resource])
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer) }, [query, rtFilter])
  useEffect(() => resource === 'citizens' ? subscribeToCitizenChanges(() => void load()) : undefined, [resource, query, rtFilter])

  const filteredRows = useMemo(() => {
    if (resource !== 'profiles') return rows
    // RT/RW tidak boleh melihat akun Developer.
    const visible = isDeveloper ? rows : rows.filter(r => r.role !== ROLES.DEVELOPER)
    if (!accountRoleFilter) return visible
    return visible.filter(r => r.role === accountRoleFilter)
  }, [rows, resource, isDeveloper, accountRoleFilter])

  const citizenRows = useMemo(() => {
    if (resource !== 'citizens') return rows
    const tab = CITIZEN_TABS.find((item) => item.key === citizenTab) ?? CITIZEN_TABS[0]
    return rows.filter(tab.match)
  }, [rows, resource, citizenTab])

  const submit = async (event) => {
    event.preventDefault()
    try {
      await saveAdmin(meta.form || 'citizen', editing)
      setEditing(null); await load()
      pushToast('success', 'Perubahan berhasil disimpan.')
    } catch (err) { setError(err.message || 'Perubahan belum tersimpan.') }
  }

  const saveKk = async (event) => {
    event.preventDefault(); setKkSaving(true); setError('')
    try { await createStaffHousehold(kkForm); setKkForm(null); await load(); pushToast('success','KK berhasil disimpan.') } catch (err) { setError(err.message || 'KK belum tersimpan.') } finally { setKkSaving(false) }
  }

  const saveRt = async (event) => {
    event.preventDefault(); setRtSaving(true); setError('')
    try {
      if (rtForm.rt_id) await updateAdminRt(rtForm.rt_id, rtForm.name)
      else await createAdminRt(rtForm.code, rtForm.name)
      setRtForm(null); await load(); pushToast('success','RT berhasil disimpan.')
    } catch (err) { setError(err.message || 'RT belum tersimpan.') } finally { setRtSaving(false) }
  }

  const openMembers = async (row) => {
    try { setMembers({ household: row, list: await listHouseholdMembers(row.household_id) }) } catch (err) { setError(err.message || 'Anggota belum dapat dimuat.') }
  }

  const makeActivation = async (row) => {
    try {
      const activation = await issueActivation(row.citizen_id)
      const qr = await makeQrDataUrl(`${window.location.origin}/warga/aktivasi?t=${encodeURIComponent(activation.token)}`)
      setCodeInfo({ name: row.full_name, code: activation.code, qr, minutes: 30 })
    } catch (err) {
      const message = err?.message || ''
      setError(/Could not find the function|PGRST202|schema cache/i.test(message)
        ? 'Fitur QR aktivasi belum aktif di server. Migrasi database terbaru belum dijalankan.'
        : message || 'QR aktivasi belum dapat dibuat.')
    }
  }

  const moveContact = async (row, direction) => {
    setBusyId(row.emergency_contact_id); setError(''); setNotice('')
    try {
      await moveAdminContact(row.emergency_contact_id, direction)
      await load(); pushToast('success','Urutan berhasil diubah.')
    } catch (err) { setError(err.message || 'Urutan belum berhasil diubah.'); await load() } finally { setBusyId(null) }
  }

  // ===================== DELETE UX STATE =====================
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { row, resource, input, warning, withAccount? }
  const [deleteProgress, setDeleteProgress] = useState(null) // { open, step, status, row, errorMsg }
  const deleteInputValid = deleteConfirm ? deleteConfirm.input.trim().toLowerCase() === 'hapus' : false

  const openDeleteConfirm = (row, warning) => {
    setDeleteConfirm({ row, warning: warning || '', input: '' })
  }

  const handleDeleteWithProgress = async (row, withAccount=false) => {
    // Close confirm, open progress
    const targetRow = row || deleteConfirm?.row
    if (!targetRow) return
    setDeleteConfirm(null)
    setDeleteProgress({ open: true, step: 1, status: 'loading', row: targetRow, errorMsg: '', withAccount })
    // Step progression tied to real request
    let stepTimer
    // Step 1 -> 2 quickly
    await new Promise(r => { stepTimer = setTimeout(r, 350) })
    setDeleteProgress(p => p ? { ...p, step: 2 } : p)
    try {
      // real delete call
      setDeleteProgress(p => p ? { ...p, step: 2 } : p)
      await deleteAdminResource(resource, targetRow, withAccount)
      setDeleteProgress(p => p ? { ...p, step: 3 } : p)
      await new Promise(r => setTimeout(r, 350))
      setDeleteProgress(p => p ? { ...p, step: 4 } : p)
      await new Promise(r => setTimeout(r, 300))
      setDeleteProgress(p => p ? { ...p, status: 'success', step: 4 } : p)
      await load()
      pushToast('success', 'Akun berhasil dihapus.')
    } catch (err) {
      const msg = err.message || 'Data belum berhasil dihapus.'
      setDeleteProgress(p => p ? { ...p, status: 'error', errorMsg: msg, step: 2 } : p)
    }
  }

  const closeDeleteProgress = () => setDeleteProgress(null)

  const changeRole = async (row, role) => {
    if (role === row.role) return
    setBusyId(row.user_id); setError(''); setNotice('')
    try {
      await setUserRoleByEmail(row.email, role)
      setNotice(`✅ Role ${row.email} diubah menjadi ${roleLabel(role)}.`)
      pushToast('success', `Role ${row.email} diubah menjadi ${roleLabel(role)}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Role belum berhasil diubah.')
      await load()
    } finally { setBusyId(null) }
  }

  const showActions = resource === 'citizens'

  // Invite states — upgraded UX
  const [inviteName, setInviteName] = useState(''); const [inviteEmail, setInviteEmail] = useState(''); const [inviteRole, setInviteRole] = useState(ROLES.NAKES); const [inviting, setInviting] = useState(false)
  // invite modal state: { open, step 1-4, status: 'loading'|'success'|'error'|'duplicate', email, errorDetail, roleLabel }
  const [inviteModal, setInviteModal] = useState(null)

  const inviteOptions = invitableRoles(callerRole).map((value) => ({ value, label: roleLabel(value) }))
  useEffect(() => {
    if (inviteOptions.length && !inviteOptions.some(o => o.value === inviteRole)) setInviteRole(inviteOptions[0].value)
  }, [callerRole])

  const doInviteRequest = async ({ email, role, fullName, roleLabelStr }) => {
    setInviteModal({ open: true, step: 1, status: 'loading', email, roleLabel: roleLabelStr, errorDetail: '' })
    setInviting(true)
    await new Promise(r => setTimeout(r, 400))
    setInviteModal(m => m ? { ...m, step: 2 } : m)
    try {
      await inviteUser(email.trim(), role, fullName.trim())
      setInviteModal(m => m ? { ...m, step: 3 } : m)
      await new Promise(r2 => setTimeout(r2, 450))
      setInviteModal(m => m ? { ...m, step: 4, status: 'success' } : m)
      return { ok: true }
    } catch (err) {
      const msg = err.message || 'Undangan gagal dikirim.'
      const isDuplicate = /sudah terdaftar|already|exists|registered/i.test(msg)
      if (isDuplicate) {
        setInviteModal(m => m ? { ...m, status: 'duplicate', errorDetail: msg, step: 2 } : m)
      } else {
        const friendly = /email|resend|smtp|limit|rate/i.test(msg) ? 'Terjadi masalah pada layanan email.' : msg
        setInviteModal(m => m ? { ...m, status: 'error', errorDetail: friendly, step: 2 } : m)
      }
      return { ok: false, duplicate: isDuplicate }
    } finally {
      setInviting(false)
    }
  }

  const submitInvite = async (event) => {
    event.preventDefault()
    if (!inviteRole || inviting) return
    await doInviteRequest({ email: inviteEmail.trim(), role: inviteRole, fullName: inviteName.trim(), roleLabelStr: roleLabel(inviteRole) })
  }

  const handleInviteSuccessClose = async () => {
    const email = inviteModal?.email
    setInviteModal(null)
    setInviteEmail(''); setInviteName('')
    if (resource === 'profiles') await load()
    pushToast('success', `Undangan berhasil dikirim ke ${email || 'email tujuan'}.`)
  }

  const handleInviteRetry = async () => {
    if (!inviteModal) return
    await doInviteRequest({ email: inviteModal.email, role: inviteRole, fullName: inviteName.trim() || '', roleLabelStr: roleLabel(inviteRole) })
  }

  return <div className="admin-page"><div className="container">
    {/* Toast */}
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' && <CheckCircle2 size={16} />}
          {t.type === 'error' && <XCircle size={16} />}
          {t.type === 'warning' && <AlertTriangle size={16} />}
          <span>{t.text}</span>
          <button onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} aria-label="Tutup notifikasi" style={{ background:'none', border:0, cursor:'pointer', padding:2, color:'inherit' }}><XCircle size={14} /></button>
        </div>
      ))}
    </div>

    <div className="staff-header"><div><div className="eyebrow">Manajemen data</div><h1 className="display">{meta.title}</h1><p>{meta.description}</p></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {resource === 'citizens' && <button className="btn btn-primary" onClick={() => navigate('/admin/warga/baru')}><Plus size={17} /> Tambah Warga</button>}
        {resource === 'households' && <button className="btn btn-primary" onClick={() => setKkForm({ rt_id: '', household_number: '', head_name: '', address: '' })}><Plus size={17} /> Tambah KK</button>}
        {resource === 'rts' && <button className="btn btn-primary" onClick={() => setRtForm({ code: '', name: '' })}><Plus size={17} /> Tambah RT</button>}
        {(meta.form && resource !== 'citizens') && <button className="btn btn-primary" onClick={() => setEditing({ is_active: true, is_published: false, is_online: false })}><Plus size={17} /> Tambah</button>}
      </div>
    </div>
    {error && <div className="staff-alert"><AlertTriangle size={17} /> {error}<button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}
    {notice && !error && <div className="form-success" style={{ marginBottom: 14 }}>{notice}</div>}

    <div className="admin-toolbar">
      <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Cari ${meta.title.toLowerCase()}`} aria-label={`Cari ${meta.title}`} /></label>
      {resource === 'citizens' && (
        <select value={rtFilter} onChange={(event) => setRtFilter(event.target.value)} aria-label="Filter RT" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <option value="">Semua RT</option>{(rts ?? []).map((rt) => <option key={rt.rt_id} value={rt.code}>{rt.code}</option>)}
        </select>
      )}
      {resource === 'profiles' && (
        <select value={accountRoleFilter} onChange={(event) => setAccountRoleFilter(event.target.value)} aria-label="Filter role" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12, minWidth: 160 }}>
          <option value="">Semua Role</option>
          {isDeveloper && <option value={ROLES.DEVELOPER}>Developer</option>}
          <option value={ROLES.RT_RW}>RT/RW</option>
          <option value={ROLES.NAKES}>Nakes</option>
          <option value={ROLES.WARGA}>Warga</option>
        </select>
      )}
    </div>

    {resource === 'citizens' && (
      <div style={{ marginBottom: 14 }}>
        <div role="tablist" aria-label="Kelompok pendaftaran warga" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {CITIZEN_TABS.map((tab) => {
            const count = rows.filter(tab.match).length
            const active = citizenTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCitizenTab(tab.key)}
                style={{
                  border: `1px solid ${active ? 'var(--teal)' : 'var(--line)'}`,
                  background: active ? 'var(--teal)' : '#fff',
                  color: active ? '#fff' : 'var(--ink)',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {tab.label} <span style={{ opacity: 0.75 }}>({count})</span>
              </button>
            )
          })}
        </div>
        <p className="muted-text" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          Menampilkan {citizenRows.length} data. Pemeriksaan dan perbaikan data dilakukan di halaman detail warga.
          {rows.length >= 100 ? ' Maksimal 100 data dimuat; gunakan pencarian atau filter RT.' : ''}
        </p>
      </div>
    )}

    {kkForm && (
      <form className="admin-form" onSubmit={saveKk}>
        <h2>Tambah Kartu Keluarga</h2>
        <div className="field-grid">
          <label>RT<select required value={kkForm.rt_id} onChange={(event) => setKkForm({ ...kkForm, rt_id: event.target.value })}>{(rts.length ? rts : []).map((rt) => <option key={rt.rt_id} value={rt.rt_id}>{rt.code}</option>)}<option disabled={!rts.length}>Memuat...</option></select></label>
          <label>Nomor KK<input required placeholder="KK-01-11" value={kkForm.household_number} onChange={(event) => setKkForm({ ...kkForm, household_number: event.target.value })} /></label>
        </div>
        <div className="field-grid">
          <label>Kepala keluarga<input required value={kkForm.head_name} onChange={(event) => setKkForm({ ...kkForm, head_name: event.target.value })} /></label>
          <label>Alamat<input value={kkForm.address} onChange={(event) => setKkForm({ ...kkForm, address: event.target.value })} /></label>
        </div>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => setKkForm(null)}>Batal</button><button className="btn btn-primary" disabled={kkSaving}><Save size={16} /> Simpan KK</button></div>
      </form>
    )}
    {rtForm && (
      <form className="admin-form" onSubmit={saveRt}>
        <h2>{rtForm.rt_id ? 'Ubah RT' : 'Tambah RT'}</h2>
        <div className="field-grid">
          {!rtForm.rt_id && <label>Kode RT<input required placeholder="RT 06" value={rtForm.code} onChange={(event) => setRtForm({ ...rtForm, code: event.target.value })} /></label>}
          <label>Nama RT<input required value={rtForm.name} onChange={(event) => setRtForm({ ...rtForm, name: event.target.value })} /></label>
        </div>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => setRtForm(null)}>Batal</button><button className="btn btn-primary" disabled={rtSaving}><Save size={16} /> Simpan</button></div>
      </form>
    )}
    {editing && resource !== 'citizens' && <EditForm resource={meta.form || 'citizen'} values={editing} setValues={setEditing} submit={submit} cancel={() => setEditing(null)} />}

    {resource === 'profiles' && (
      <>
        {inviteOptions.length > 0 && (
          <form className="admin-form" onSubmit={submitInvite} style={{ marginBottom: 14 }}>
            <h2>Undang pengguna baru (via email)</h2>
            <div className="field-grid">
              <label>Nama lengkap<input required placeholder="Contoh: Putri Imelda" value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
              <label>Email Google target<input required type="email" placeholder="nama@gmail.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
            </div>
            <div className="field-grid" style={{ marginTop: 12 }}>
              <label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                {inviteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
            </div>
            {!isDeveloper && (
              <div className="invite-warning" role="alert">
                <AlertTriangle size={14} /> Hanya Developer yang dapat mengundang akun RT/RW.
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" disabled={inviting || !inviteEmail.trim() || !inviteName.trim() || !inviteRole} aria-busy={inviting}>
                {inviting ? <><Loader2 size={16} className="spin" /> Menyiapkan undangan...</> : <><ShieldCheck size={16} /> Kirim Undangan</>}
              </button>
            </div>
          </form>
        )}
      </>
    )}

    {/* Invite Progress Modal */}
    {inviteModal?.open && (
      <div className="ux-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && inviteModal.status !== 'loading') setInviteModal(null) }}>
        <div className="ux-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title" onKeyDown={(e) => { if (e.key === 'Escape' && inviteModal.status !== 'loading') setInviteModal(null) }} tabIndex={-1}>
          {inviteModal.status === 'loading' && (
            <>
              <div className="ux-modal-icon"><Mail size={26} /><Loader2 size={14} className="spin ux-modal-icon-spin" /></div>
              <h3 id="invite-modal-title" className="ux-modal-title">Mengirim undangan</h3>
              <p className="ux-modal-desc">Mohon tunggu, undangan sedang dikirim ke email tujuan.</p>
              <div className="ux-steps">
                {['Menyiapkan undangan','Mengirim email','Email berhasil dikirim','Selesai'].map((label, i) => {
                  const idx = i+1
                  const active = inviteModal.step === idx
                  const done = inviteModal.step > idx
                  return (
                    <div key={label} className={`ux-step ${active ? 'active' : ''} ${done ? 'done' : ''} ${!active && !done ? 'pending' : ''}`}>
                      <span className="ux-step-icon">
                        {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={14} className="spin" /> : <span className="ux-dot" />}
                      </span>
                      <span className="ux-step-label">{label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="ux-progress-bar"><div className="ux-progress-fill" style={{ width: `${(inviteModal.step/4)*100}%` }} /></div>
            </>
          )}
          {inviteModal.status === 'success' && (
            <>
              <div className="ux-modal-icon success"><CheckCircle2 size={28} /></div>
              <h3 className="ux-modal-title">Undangan berhasil dikirim!</h3>
              <p className="ux-modal-desc">Undangan telah dikirim ke<br /><strong>{inviteModal.email}</strong></p>
              <p className="ux-modal-desc small">User dapat mengikuti tautan pada email untuk bergabung ke Desa Sehat.</p>
              <button className="btn btn-primary btn-wide" onClick={handleInviteSuccessClose} autoFocus>Selesai</button>
            </>
          )}
          {inviteModal.status === 'duplicate' && (
            <>
              <div className="ux-modal-icon warning"><AlertCircle size={28} /></div>
              <h3 className="ux-modal-title">Email sudah terdaftar</h3>
              <p className="ux-modal-desc">Email tersebut sudah memiliki akun di Desa Sehat.</p>
              {inviteModal.errorDetail && <p className="ux-modal-desc small" style={{ color:'#92400e' }}>{inviteModal.errorDetail}</p>}
              <div className="ux-modal-actions">
                <button className="btn btn-ghost" onClick={() => setInviteModal(null)}>Tutup</button>
              </div>
            </>
          )}
          {inviteModal.status === 'error' && (
            <>
              <div className="ux-modal-icon error"><XCircle size={28} /></div>
              <h3 className="ux-modal-title">Gagal mengirim undangan</h3>
              <p className="ux-modal-desc">Undangan tidak dapat dikirim saat ini.</p>
              {inviteModal.errorDetail && <p className="ux-modal-desc small" style={{ color:'#b42318' }}>{inviteModal.errorDetail}</p>}
              <div className="ux-modal-actions">
                <button className="btn btn-ghost" onClick={() => setInviteModal(null)}>Tutup</button>
                <button className="btn btn-primary" onClick={handleInviteRetry}>Coba lagi</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {/* Delete Confirm Modal */}
    {deleteConfirm && (
      <div className="ux-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
        <div className="ux-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" tabIndex={-1} onKeyDown={(e)=>{ if(e.key==='Escape') setDeleteConfirm(null)}}>
          <div className="ux-modal-icon error"><Trash2 size={26} /></div>
          <h3 id="delete-confirm-title" className="ux-modal-title">Hapus Akun?</h3>
          <p className="ux-modal-desc">Apakah Anda yakin ingin menghapus akun <strong>{rowNameOf(deleteConfirm.row)}</strong>?</p>
          <div className="ux-warning-box">
            Tindakan ini dapat menghapus data terkait akun secara permanen dan tidak dapat dibatalkan.
            {deleteConfirm.warning && <span style={{ display:'block', marginTop:6, fontSize:12, color:'#9b5148' }}>{deleteConfirm.warning}</span>}
          </div>
          <label className="ux-input-label">Ketik <strong>HAPUS</strong> untuk melanjutkan.
            <input
              autoFocus
              placeholder='Ketik "HAPUS"'
              value={deleteConfirm.input}
              onChange={e => setDeleteConfirm({ ...deleteConfirm, input: e.target.value })}
              className="ux-input"
              aria-label='Ketik HAPUS untuk konfirmasi'
            />
          </label>
          <div className="ux-modal-actions">
            <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Batal</button>
            <button className="btn btn-danger" disabled={!deleteInputValid} onClick={() => handleDeleteWithProgress(deleteConfirm.row)}>Hapus Akun</button>
          </div>
        </div>
      </div>
    )}

    {/* Delete Progress Modal */}
    {deleteProgress?.open && (
      <div className="ux-modal-overlay" role="presentation">
        <div className="ux-modal" role="dialog" aria-modal="true" aria-labelledby="delete-progress-title" tabIndex={-1}>
          {deleteProgress.status === 'loading' && (
            <>
              <div className="ux-modal-icon error"><Trash2 size={26} /><Loader2 size={14} className="spin ux-modal-icon-spin" /></div>
              <h3 id="delete-progress-title" className="ux-modal-title">Menghapus akun</h3>
              <p className="ux-modal-desc">Mohon tunggu, akun sedang diproses.</p>
              <div className="ux-steps vertical">
                {['Memeriksa data','Menghapus akun','Membersihkan data terkait','Selesai'].map((label,i)=>{
                  const idx=i+1; const active=deleteProgress.step===idx; const done=deleteProgress.step>idx
                  return (
                    <div key={label} className={`ux-step ${active?'active':''} ${done?'done':''}`}>
                      <span className="ux-step-icon">{done ? <CheckCircle2 size={14}/> : active ? <Loader2 size={12} className="spin"/> : <span className="ux-dot"/>}</span>
                      <span className="ux-step-label">{label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="ux-progress-bar"><div className="ux-progress-fill danger" style={{ width: `${(deleteProgress.step/4)*100}%` }} /></div>
            </>
          )}
          {deleteProgress.status === 'success' && (
            <>
              <div className="ux-modal-icon success"><CheckCircle2 size={28} /></div>
              <h3 className="ux-modal-title">Akun berhasil dihapus</h3>
              <p className="ux-modal-desc">Data akun dan data terkait telah dihapus dari sistem.</p>
              <button className="btn btn-primary btn-wide" onClick={closeDeleteProgress} autoFocus>Selesai</button>
            </>
          )}
          {deleteProgress.status === 'error' && (
            <>
              <div className="ux-modal-icon error"><XCircle size={28} /></div>
              <h3 className="ux-modal-title">Gagal menghapus akun</h3>
              <p className="ux-modal-desc">Terjadi masalah saat menghapus akun.</p>
              {deleteProgress.errorMsg && <p className="ux-modal-desc small" style={{ color:'#b42318' }}>{deleteProgress.errorMsg}</p>}
              <div className="ux-modal-actions">
                <button className="btn btn-ghost" onClick={closeDeleteProgress}>Tutup</button>
                <button className="btn btn-primary" onClick={() => { const r=deleteProgress.row; const w=deleteProgress.withAccount; closeDeleteProgress(); setTimeout(()=>handleDeleteWithProgress(r,w),150)}}>Coba lagi</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {codeInfo && (
      <div className="card" role="dialog" aria-label="Kode aktivasi" style={{ border: '1px solid var(--teal)', background: '#f0faf7', padding: 16, borderRadius: 14, marginBottom: 14 }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}><KeyRound size={17} /> Kode Aktivasi — {codeInfo.name}</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>KODE MANUAL (input di scan warga):</p>
            <strong style={{ fontSize: 24, letterSpacing: 3 }}>{codeInfo.code}</strong>
            <p style={{ margin: '4px 0', fontSize: 12.5 }}>Berlaku {codeInfo.minutes ?? 30} menit & sekali pakai.</p></div>
          {codeInfo.qr && <img src={codeInfo.qr} alt="QR aktivasi" style={{ width: 120, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', padding: 4 }} />}
        </div>
        <p style={{ margin: '6px 0 10px', fontSize: 13 }}>QR berisi tautan aktivasi — bisa discan langsung dengan kamera HP warga (otomatis terbuka), atau warga memasukkan <strong>Kode Manual</strong> di halaman aktivasi. Hanya berlaku untuk warga yang sudah terverifikasi.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {codeInfo.qr && <button className="btn btn-ghost" onClick={() => downloadQr(codeInfo.qr, `qr-aktivasi-${codeInfo.name}.png`)}><Download size={15} /> Unduh QR</button>}
          {codeInfo.qr && <button className="btn btn-ghost" onClick={() => printQr(codeInfo.qr, 'Aktivasi Akun Warga', `${codeInfo.name} — kode ${codeInfo.code}`)}><Printer size={15} /> Cetak</button>}
          <button className="btn btn-ghost" onClick={() => setCodeInfo(null)}>Tutup</button>
        </div>
      </div>
    )}

    {(() => { const displayRows = resource === 'profiles' ? filteredRows : resource === 'citizens' ? citizenRows : rows; return displayRows.length === 0 ? (loading ? <p className="muted-text">Memuat data...</p> : <p className="muted-text">Data belum ditemukan.{resource==='profiles' && accountRoleFilter ? ' Coba ubah filter atau cari akun lain.' : ''}</p>) : (
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr>{meta.columns.map(([, label]) => <th key={label}>{label}</th>)}{(showActions || ['households', 'rts', 'emergency_contacts', 'health_workers', 'profiles'].includes(resource)) && <th>Aksi</th>}</tr></thead>
        <tbody>
          {displayRows.map((row) => <tr key={row[Object.keys(row)[0]]}>
            {meta.columns.map(([key, label]) => {
              if (meta.roleControl && key === 'role') {
                const canModifyRole = canChangeRole(callerRole, row.role)
                const assignable = assignableRoles(callerRole)
                return (
                  <td key={key} data-label={label}>
                    <select
                      value={row.role}
                      disabled={busyId === row.user_id || !canModifyRole}
                      onChange={(event) => void changeRole(row, event.target.value)}
                      style={{ minHeight: 40, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 10, background: canModifyRole ? '#fff' : '#f3f4f6', fontSize: 13 }}
                      aria-label={`Role ${row.display_name ?? row.email ?? ''}`}
                      title={!canModifyRole ? `Tidak berwenang mengubah role ${roleLabel(row.role)}` : ''}
                    >
                      {assignable.length === 0 && <option value={row.role}>{roleLabel(row.role)}</option>}
                      {assignable.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}
                    </select>
                  </td>
                )
              }
              const cellContent = meta.renderCell ? meta.renderCell(key, row[key], row) : formatCell(key, row[key])
              return <td key={key} data-label={label}>{cellContent}</td>
            })}
            {showActions && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">
              <button className="btn btn-ghost table-action" onClick={() => navigate(`/admin/warga/${row.citizen_id}`)}>
                {['pending', 'needs_correction', 'rejected'].includes(row.verification_status) ? <><ShieldCheck size={14} /> Periksa</> : 'Detail'}
              </button>
              <button className="btn btn-ghost table-action" onClick={() => navigate(`/admin/warga/${row.citizen_id}`)}><Save size={14} /> Ubah</button>
              {row.verification_status === 'verified' && !row.activated_at && (
                <button className="btn btn-ghost table-action" onClick={() => void makeActivation(row)}><KeyRound size={14} /> QR Aktivasi</button>
              )}
              <button className="btn btn-danger table-action" disabled={busyId === rowIdOf(row)} onClick={() => openDeleteConfirm(row)}>Hapus</button>
            </td>}
            {resource === 'households' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => void openMembers(row)}>Anggota</button><button className="btn btn-danger table-action" disabled={busyId===rowIdOf(row)} onClick={()=>openDeleteConfirm(row)}>Hapus</button></td>}
            {resource === 'rts' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => setRtForm({ rt_id: row.rt_id, code: row.code, name: row.name })}>Ubah nama</button><button className="btn btn-danger table-action" disabled={busyId===rowIdOf(row)} onClick={()=>openDeleteConfirm(row)}>Hapus</button></td>}
            {resource === 'health_workers' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => setEditing({ ...row })}><Save size={14} /> Ubah</button><button className="btn btn-danger table-action" disabled={busyId===rowIdOf(row)} onClick={()=>openDeleteConfirm(row)}>Hapus</button></td>}
            {resource === 'profiles' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">{(() => {
              const isSelf = row.user_id === access?.user_id
              if (!canDeleteRole(callerRole, row.role)) {
                if (isSelf) return <span className="muted-text" style={{ fontSize: 12 }}>Akun sendiri</span>
                if (row.role === ROLES.DEVELOPER) return <span className="muted-text" style={{ fontSize: 12 }}>Akun Developer tidak dapat dihapus</span>
                return <span className="muted-text" style={{ fontSize: 12 }}>Hanya Developer yang dapat menghapus akun</span>
              }
              if (isSelf) return <span className="muted-text" style={{ fontSize: 12 }}>Akun sendiri</span>
              return <button className="btn btn-danger table-action" disabled={busyId===row.user_id} onClick={() => openDeleteConfirm(row, 'Akun + semua data terhubung akan dihapus permanen.')}>Hapus</button>
            })()}</td>}
            {resource === 'emergency_contacts' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">
              <button className="btn btn-ghost table-action" disabled={busyId === row.emergency_contact_id} onClick={() => void moveContact(row, 'up')} aria-label={`Naikkan urutan ${row.label}`}><ChevronUp size={14} /> Naik</button>
              <button className="btn btn-ghost table-action" disabled={busyId === row.emergency_contact_id} onClick={() => void moveContact(row, 'down')} aria-label={`Turunkan urutan ${row.label}`}><ChevronDown size={14} /> Turun</button>
              <button className="btn btn-ghost table-action" onClick={() => setEditing({ ...row })}><Save size={14} /> Ubah</button>
              <button className="btn btn-danger table-action" disabled={busyId===row.emergency_contact_id} onClick={()=>openDeleteConfirm(row)}>Hapus</button>
            </td>}
          </tr>)}
        </tbody>
      </table></div>
    )})()}

    {members && (
      <div className="admin-panel" style={{ marginTop: 14 }}>
        <div className="staff-panel-head"><div><h2>Anggota KK {members.household.household_number}</h2><p>{members.household.head_name} · {members.household.rt_code}</p></div><button className="btn btn-ghost" onClick={() => setMembers(null)}>Tutup</button></div>
        <div className="record-table">{(members.list ?? []).map((member) => (
          <div className="record-row" key={member.citizen_id}>
            <div><strong>{member.full_name}</strong><small>{member.family_relation || 'Anggota'} - NIK ****{member.nik_last4}</small></div>
            <span>{member.google_connected ? 'Terhubung' : 'Belum terhubung'}</span>
            <button type="button" className="btn btn-ghost table-action" onClick={() => navigate(`/admin/warga/${member.citizen_id}`)}>Lihat</button>
          </div>
        ))}{(members.list ?? []).length === 0 && <p className="muted-text">Belum ada anggota pada KK ini.</p>}</div>
      </div>
    )}
  </div></div>
}

function rowIdOf(row) { return row.citizen_id || row.household_id || row.rt_id || row.health_worker_id || row.user_id || row.emergency_contact_id || row.audit_log_id }
function rowNameOf(row) { return row.full_name || row.label || row.household_number || row.code || row.email || row.title || 'data ini' }

function formatCell(key, value) {
  if (key === 'google_connected') return value ? '🟢 Terhubung' : '🟡 Belum terhubung'
  if (key === 'is_published') return value ? 'Terbit' : 'Draft'
  if (value === true) return 'Ya'; if (value === false) return 'Tidak'
  if (key === 'metadata') return JSON.stringify(value)
  if (key === 'created_at' || key === 'updated_at') return value ? new Date(value).toLocaleString('id-ID') : '—'
  return value || '—'
}

function EditForm({ resource, values, setValues, submit, cancel }) {
  const fields = resource === 'worker' ? [['full_name', 'Nama'], ['position', 'Jabatan'], ['specialty', 'Bidang'], ['phone', 'Kontak']] : resource === 'article' ? [['title', 'Judul'], ['slug', 'Slug (contoh: memahami-tekanan-darah)'], ['summary', 'Ringkasan'], ['content', 'Isi artikel (pisahkan paragraf dengan baris kosong)']] : resource === 'contact' ? [['officer_name', 'Nama petugas'], ['label', 'Label'], ['phone', 'Nomor telepon / WhatsApp']] : [['full_name', 'Nama'], ['phone', 'Kontak']]
  if (resource === 'worker') {
    return <form className="admin-form" onSubmit={submit}>
      <h2>{values.health_worker_id ? 'Ubah data nakes' : 'Tambah nakes'}</h2>
      <div className="field-grid">{fields.map(([key, label]) => <label key={key}>{label}<input required={['full_name','position'].includes(key)} value={values[key] ?? ''} onChange={e=>setValues({...values, [key]: e.target.value})}/></label>)}</div>
      <div className="field-grid">
        <label>WhatsApp<input inputMode="tel" placeholder="08xxxxxxxxxx" value={values.whatsapp_number ?? values.whatsapp ?? ''} onChange={e=>setValues({...values, whatsapp_number: e.target.value})}/></label>
        <label>Avatar URL<input placeholder="https://... atau upload via profil nakes" value={values.avatar_url ?? ''} onChange={e=>setValues({...values, avatar_url: e.target.value})}/></label>
      </div>
      <div className="field-grid">
        <label>Status<select value={values.work_status ?? (values.is_online?'Sedang bertugas':'Tidak sedang bertugas')} onChange={e=>setValues({...values, work_status: e.target.value})}><option>Sedang bertugas</option><option>Sedang menangani warga</option><option>Tidak sedang bertugas</option><option>Tidak tersedia</option></select></label>
        <label>Layanan (koma)<input placeholder="Pemeriksaan umum, Tekanan darah" value={values.services ?? values.specialty ?? ''} onChange={e=>setValues({...values, services: e.target.value, specialty: e.target.value})}/></label>
      </div>
      <label>Jadwal<input placeholder="Senin - Jumat, 08.00 - 15.00" value={values.schedule ?? ''} onChange={e=>setValues({...values, schedule: e.target.value})}/></label>
      <label className="check-row"><input type="checkbox" checked={Boolean(values.is_siaga)} onChange={e=>setValues({...values, is_siaga: e.target.checked})}/> <span>Petugas Siaga <small>Tampilkan di section Siaga</small></span></label>
      <label className="check-row"><input type="checkbox" checked={Boolean(values.is_active)} onChange={e=>setValues({...values, is_active: e.target.checked})}/> <span>Data aktif</span></label>
      <p className="muted-text" style={{fontSize:12}}>Foto nakes akan tampil di Landing Page & Tim Kesehatan setelah disimpan. Nakes juga bisa update foto sendiri via menu Profil Saya.</p>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={cancel}>Batal</button><button className="btn btn-primary"><Save size={16}/> Simpan</button></div>
    </form>
  }
  return <form className="admin-form" onSubmit={submit}>
    <h2>{values[`${resource}_id`] || values.citizen_id ? 'Ubah data' : 'Tambah data'}</h2>
    <div className="field-grid">{fields.map(([key, label]) => <label key={key}>{label}{key === 'content' ? <textarea required rows={6} value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /> : <input required={['full_name', 'position', 'title', 'slug', 'label'].includes(key) || (resource === 'contact' && key === 'phone')} inputMode={resource === 'contact' && key === 'phone' ? 'tel' : undefined} value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />}</label>)}</div>
    {resource === 'contact' && <p className="muted-text" style={{ margin: '2px 0 0' }}>Tautan WhatsApp dibuat otomatis dari nomor (format 08xx, 62xx, atau +62xx). Urutan tampil diatur lewat tombol Naik/Turun pada daftar.</p>}
    {resource === 'article' && (
      <>
        <div className="field-grid">
          <label>Kategori<select value={values.category ?? ''} onChange={(event) => setValues({ ...values, category: event.target.value })}><option value="">Umum</option>{['Tekanan Darah', 'Gula Darah', 'Pola Makan', 'Aktivitas Fisik', 'Kesehatan Lansia', 'Kesehatan Anak', 'Pertolongan Pertama', 'Pencegahan Penyakit', 'Pemeriksaan Rutin', 'Kesehatan Keluarga'].map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label>Thumbnail URL<input placeholder="https://..." value={values.thumbnail_url ?? ''} onChange={(event) => setValues({ ...values, thumbnail_url: event.target.value })} /></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={Boolean(values.is_published)} onChange={(event) => setValues({ ...values, is_published: event.target.checked })} /> <span>Terbitkan (tampil ke publik)</span></label>
        <label className="check-row"><input type="checkbox" checked={Boolean(values.is_archived)} onChange={(event) => setValues({ ...values, is_archived: event.target.checked })} /> <span>Arsipkan (sembunyikan dari daftar)</span></label>
      </>
    )}
    {resource !== 'article' && <label className="check-row"><input type="checkbox" checked={Boolean(values.is_active)} onChange={(event) => setValues({ ...values, is_active: event.target.checked })} /> <span>Data aktif</span></label>}
    <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={cancel}>Batal</button><button className="btn btn-primary"><Save size={16} /> Simpan</button></div>
  </form>
}
