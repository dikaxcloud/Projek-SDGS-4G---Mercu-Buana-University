import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp, Download, KeyRound, Plus, Printer, RefreshCw, Save, Search, ShieldCheck, Trash2, UserX, UserCheck, UserX as UserXIcon, Wifi, WifiOff, Shield } from 'lucide-react'
import { deleteAdminResource, getDemoAdminRows, getTier, isAppOwner, inviteUser, listAdmin, moveAdminContact, saveAdmin, setAdminTier, setUserRoleByEmail, tierLabel } from '../features/admin/adminService'
import { createActivationCode, createStaffHousehold, createAdminRt, listHouseholdMembers, listStaffCitizens, listStaffHouseholds, listStaffRts, updateStaffCitizen, updateAdminRt } from '../features/staff/staffService'
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
      ['verification_status', 'Verifikasi'],
      ['google_connected', 'Akun Google'],
      ['is_active', 'Status'],
    ],
    renderCell: (key, value, row) => {
      if (key === 'google_connected') return statusBadge(value ? 'Terhubung' : 'Belum', value ? '#16a34a' : '#f59e0b', value ? UserCheck : UserXIcon)
      if (key === 'is_active') return statusBadge(value ? 'Aktif' : 'Tidak aktif', value ? '#16a34a' : '#ef4444', value ? UserCheck : UserXIcon)
      if (key === 'verification_status') {
        const map = { verified: ['Terverifikasi', '#16a34a', UserCheck], pending_verification: ['Menunggu verifikasi', '#f59e0b', AlertTriangle], pending: ['Pending', '#f59e0b', AlertTriangle], rejected: ['Ditolak', '#ef4444', UserXIcon], unverified: ['Belum', '#6b7280', UserXIcon] }
        const [label, color, Icon] = map[value] || ['—', '#6b7280', null]
        return statusBadge(label, color, Icon)
      }
      return String(value || '—')
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
    columns: [['display_name', 'Nama'], ['email', 'Email Google'], ['role', 'Role'], ['admin_tier', 'Tier'], ['is_active', 'Status']],
    roleControl: true,
    renderCell: (key, value, row) => {
      if (key === 'role') return statusBadge(value, value === 'admin' ? '#7c3aed' : value === 'nakes' ? '#0891b2' : '#16a34a', Shield)
      if (key === 'admin_tier') {
        if (row.role !== 'admin') return statusBadge(row.role === 'nakes' ? 'Tier 4' : 'Tier 5', '#6b7280', Shield)
        const t = value ?? 3
        const map = { 1: ['Tier 1 Owner', '#dc2626'], 2: ['Tier 2 Senior', '#7c3aed'], 3: ['Tier 3 Junior', '#0891b2'] }
        const [label, color] = map[t] || [`Tier ${t}`, '#6b7280']
        return statusBadge(label, color, Shield)
      }
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

export function AdminManagementPage({ resource }) {
  const meta = config[resource]
  const navigate = useNavigate()
  const { access } = useAuth()
  const isCallerAdmin = access?.role === 'admin'
  const [rows, setRows] = useState([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editing, setEditing] = useState(null)
  // Citizen filters
  const [statusFilter, setStatusFilter] = useState('')
  const [rtFilter, setRtFilter] = useState('')
  const [rts, setRts] = useState([])
  // Household creation / members & RT editing state
  const [kkForm, setKkForm] = useState(null); const [kkSaving, setKkSaving] = useState(false); const [members, setMembers] = useState(null)
  const [rtForm, setRtForm] = useState(null); const [rtSaving, setRtSaving] = useState(false)
  // Activation code dialog
  const [codeInfo, setCodeInfo] = useState(null)
  // Emergency contact: reorder + delete (2-step inline confirm)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  // Owner flag: enables the Admin role option on the profiles page
  const [isOwner, setIsOwner] = useState(false)
  useEffect(() => { if (resource === 'profiles') isAppOwner().then(setIsOwner).catch(() => {}) }, [resource])
  const callerTier = getTier(access) // 1=Owner,2=Senior,3=Junior,4=Nakes,5=Warga
  const isTier1 = callerTier === 1
  const isSeniorOrOwner = callerTier <= 2

  const load = async () => {
    setLoading(true); setError('')
    try {
      if (resource === 'citizens') {
        const [rowsData, rtsData] = await Promise.all([listStaffCitizens({ query, rt: rtFilter, status: statusFilter }), listStaffRts()])
        setRows(rowsData ?? []); setRts(rtsData ?? [])
      } else if (resource === 'households') {
        setRows(await listStaffHouseholds(query))
      } else {
        setRows(await listAdmin(resource, query))
      }
    } catch (err) { setError(err.message || 'Data belum dapat dimuat.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [resource])
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer) }, [query, statusFilter, rtFilter])
  useEffect(() => resource === 'citizens' ? subscribeToCitizenChanges(() => void load()) : undefined, [resource, query, rtFilter, statusFilter])

  const submit = async (event) => {
    event.preventDefault()
    try {
      if ((meta.form || 'citizen') === 'citizen' && editing?.citizen_id) await updateStaffCitizen(editing)
      else await saveAdmin(meta.form || 'citizen', editing)
      setEditing(null); await load()
    } catch (err) { setError(err.message || 'Perubahan belum tersimpan.') }
  }

  const saveKk = async (event) => {
    event.preventDefault(); setKkSaving(true); setError('')
    try { await createStaffHousehold(kkForm); setKkForm(null); await load() } catch (err) { setError(err.message || 'KK belum tersimpan.') } finally { setKkSaving(false) }
  }

  const saveRt = async (event) => {
    event.preventDefault(); setRtSaving(true); setError('')
    try {
      if (rtForm.rt_id) await updateAdminRt(rtForm.rt_id, rtForm.name)
      else await createAdminRt(rtForm.code, rtForm.name)
      setRtForm(null); await load()
    } catch (err) { setError(err.message || 'RT belum tersimpan.') } finally { setRtSaving(false) }
  }

  const openMembers = async (row) => {
    try { setMembers({ household: row, list: await listHouseholdMembers(row.household_id) }) } catch (err) { setError(err.message || 'Anggota belum dapat dimuat.') }
  }

  const makeActivationCode = async (row) => {
    try {
      const code = await createActivationCode(row.citizen_id)
      const qr = await makeQrDataUrl(`${window.location.origin}/hubungkan-akun?code=${encodeURIComponent(code)}`)
      setCodeInfo({ name: row.full_name, code, qr })
    } catch (err) { setError(err.message || 'Kode aktivasi belum dapat dibuat.') }
  }

  const moveContact = async (row, direction) => {
    setBusyId(row.emergency_contact_id); setError(''); setNotice('')
    try {
      await moveAdminContact(row.emergency_contact_id, direction)
      await load()
    } catch (err) { setError(err.message || 'Urutan belum berhasil diubah.'); await load() } finally { setBusyId(null) }
  }

  const removeResource = async (row, withAccount = false) => {
    setBusyId(rowIdOf(row)); setError(''); setNotice('')
    try {
      await deleteAdminResource(resource, row, withAccount)
      setDeleteId(null)
      setNotice(withAccount ? `✅ "${rowNameOf(row)}" + akun Google-nya dihapus.` : `✅ "${rowNameOf(row)}" dihapus.`)
      await load()
    } catch (err) { setError(err.message || 'Data belum berhasil dihapus.'); await load() } finally { setBusyId(null) }
  }

  // Per-row role control (profiles page): nakes <-> warga via email.
  const changeRole = async (row, role) => {
    if (role === row.role) return
    setBusyId(row.user_id); setError(''); setNotice('')
    try {
      await setUserRoleByEmail(row.email, role)
      setNotice(`✅ Role ${row.email} diubah menjadi ${role}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Role belum berhasil diubah.')
      await load()
    } finally { setBusyId(null) }
  }

  const showActions = resource === 'citizens'

  // Role promotion form (profiles page)
  const [promoteEmail, setPromoteEmail] = useState(''); const [promoteRole, setPromoteRole] = useState('nakes'); const [promoteMsg, setPromoteMsg] = useState(null); const [promoting, setPromoting] = useState(false)
  // Invite user form (profiles page) - single box for all tiers (Owner invite tier 2/3/4/5, Senior invite tier 3/4/5, Junior invite 4/5)
  const [inviteName, setInviteName] = useState(''); const [inviteEmail, setInviteEmail] = useState(''); const [inviteTier, setInviteTier] = useState('tier4'); const [inviteMsg, setInviteMsg] = useState(null); const [inviting, setInviting] = useState(false)
  const submitPromote = async (event) => {
    event.preventDefault(); setPromoting(true); setPromoteMsg(null)
    try {
      const res = await setUserRoleByEmail(promoteEmail.trim(), promoteRole)
      setPromoteMsg({ ok: true, text: `Berhasil! ${res.user_id ? 'Akun' : 'Akun'} sekarang ber-role ${res.role}.` })
      setPromoteEmail('')
      if (resource === 'profiles') await load()
    } catch (err) { setPromoteMsg({ ok: false, text: err.message || 'Promosi role belum berhasil.' }) } finally { setPromoting(false) }
  }

  const getInviteOptions = () => {
    if (callerTier === 1) return [
      { value: 'tier2', label: 'Senior Admin (Tier 2)' },
      { value: 'tier3', label: 'Junior Admin (Tier 3)' },
      { value: 'tier4', label: 'Nakes (Tier 4)' },
      { value: 'tier5', label: 'Warga (Tier 5)' },
    ]
    if (callerTier === 2) return [
      { value: 'tier3', label: 'Junior Admin (Tier 3)' },
      { value: 'tier4', label: 'Nakes (Tier 4)' },
      { value: 'tier5', label: 'Warga (Tier 5)' },
    ]
    if (callerTier === 3) return [
      { value: 'tier4', label: 'Nakes (Tier 4)' },
      { value: 'tier5', label: 'Warga (Tier 5)' },
    ]
    return []
  }
  useEffect(() => {
    const opts = getInviteOptions()
    if (opts.length && !opts.some(o => o.value === inviteTier)) setInviteTier(opts[0].value)
  }, [callerTier])

  const submitInvite = async (event) => {
    event.preventDefault(); setInviting(true); setInviteMsg(null)
    try {
      let role = 'warga'; let tier = null
      if (inviteTier === 'tier2') { role = 'admin'; tier = 2 }
      else if (inviteTier === 'tier3') { role = 'admin'; tier = 3 }
      else if (inviteTier === 'tier4') role = 'nakes'
      else if (inviteTier === 'tier5') role = 'warga'
      else role = inviteTier // fallback
      const res = await inviteUser(inviteEmail.trim(), role, inviteName.trim(), tier)
      // If Owner invited Senior (tier2), need to set tier 2 explicitly (invite defaults to tier3)
      if (role === 'admin' && tier === 2) {
        try {
          // find user_id by email after invite, then set tier
          const rows = await listAdmin('profiles', inviteEmail.trim())
          const target = rows.find(r => (r.email || '').toLowerCase() === inviteEmail.trim().toLowerCase())
          if (target?.user_id) await setAdminTier(target.user_id, 2)
        } catch {}
      }
      const label = inviteTier === 'tier2' ? 'Senior Admin (Tier 2)' : inviteTier === 'tier3' ? 'Junior Admin (Tier 3)' : inviteTier === 'tier4' ? 'Nakes (Tier 4)' : 'Warga (Tier 5)'
      setInviteMsg({ ok: true, text: `✅ Undangan terkirim ke ${inviteEmail} sebagai ${label}. User login via link email → role otomatis aktif.` })
      setInviteEmail(''); setInviteName('')
      if (resource === 'profiles') await load()
    } catch (err) { setInviteMsg({ ok: false, text: err.message || 'Undangan gagal dikirim.' }) } finally { setInviting(false) }
  }
  return <div className="admin-page"><div className="container">
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
      {resource === 'citizens' && <>
        <select value={rtFilter} onChange={(event) => setRtFilter(event.target.value)} aria-label="Filter RT" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <option value="">Semua RT</option>{(rts ?? []).map((rt) => <option key={rt.rt_id} value={rt.code}>{rt.code}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <option value="">Semua status</option>
          <option value="verified">Terverifikasi</option>
          <option value="pending_verification">Pending Verifikasi</option>
          <option value="rejected">Ditolak</option>
          <option value="connected">Google terhubung</option>
          <option value="pending">Belum terhubung</option>
          <option value="active">Aktif</option>
          <option value="inactive">Tidak aktif</option>
        </select>
      </>}
    </div>

    {/* Inline forms */}
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
    {editing && resource === 'citizens' && (
      <form className="admin-form" onSubmit={submit}>
        <h2>Ubah data warga</h2>
        <div className="field-grid">
          <label>Nama lengkap<input required value={editing.full_name ?? ''} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} /></label>
          <label>Kontak<input value={editing.phone ?? ''} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
        </div>
        <div className="field-grid">
          <label>Jenis kelamin<select value={editing.gender ?? ''} onChange={(event) => setEditing({ ...editing, gender: event.target.value })}><option value="">Pilih</option><option value="laki-laki">Laki-laki</option><option value="perempuan">Perempuan</option></select></label>
          <label>Golongan darah<select value={editing.blood_type ?? ''} onChange={(event) => setEditing({ ...editing, blood_type: event.target.value })}><option value="">Pilih</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type}>{type}</option>)}</select></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={Boolean(editing.is_active)} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} /> <span>Data aktif (nonaktifkan untuk soft-delete)</span></label>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Batal</button><button className="btn btn-primary"><Save size={16} /> Simpan</button></div>
      </form>
    )}
    {editing && resource !== 'citizens' && <EditForm resource={meta.form || 'citizen'} values={editing} setValues={setEditing} submit={submit} cancel={() => setEditing(null)} />}

    {resource === 'profiles' && (
      <>
        {(callerTier <= 3) && (
          <form className="admin-form" onSubmit={submitInvite} style={{ marginBottom: 14 }}>
            <h2>Undang pengguna baru (via email)</h2>
            <p className="muted-text" style={{ marginTop: -6 }}>
              Kirim undangan lewat email. User klik link → login Google → nama dan role otomatis diset. Tidak perlu user login dulu.
              {callerTier === 1 && ' Sebagai Owner/Developer (Tier 1), Anda dapat mengundang Senior Admin (Tier 2), Junior Admin (Tier 3), Nakes (Tier 4), dan Warga (Tier 5) dalam 1 kotak ini.'}
              {callerTier === 2 && ' Sebagai Senior Admin (Tier 2), Anda dapat mengundang Junior Admin (Tier 3), Nakes (Tier 4), dan Warga (Tier 5).'}
              {callerTier === 3 && ' Sebagai Junior Admin (Tier 3), Anda dapat mengundang Nakes (Tier 4) dan Warga (Tier 5).'}
            </p>
            <div className="field-grid">
              <label>Nama lengkap<input required placeholder="Contoh: Putri Imelda" value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
              <label>Email Google target<input required type="email" placeholder="nama@gmail.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
            </div>
            <div className="field-grid" style={{ marginTop: 12 }}>
              <label>Role / Tier<select value={inviteTier} onChange={(event) => setInviteTier(event.target.value)}>
                {getInviteOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
            </div>
            {inviteMsg && <p role="status" style={{ color: inviteMsg.ok ? 'var(--teal-dark)' : '#b42318', fontSize: 13, margin: '12px 0 0' }}>{inviteMsg.text}</p>}
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" disabled={inviting || !inviteEmail.trim()}><ShieldCheck size={16} /> {inviting ? 'Mengirim...' : 'Kirim Undangan'}</button>
            </div>
          </form>
        )}
      </>
    )}

    {codeInfo && (
      <div className="card" role="dialog" aria-label="Kode aktivasi" style={{ border: '1px solid var(--teal)', background: '#f0faf7', padding: 16, borderRadius: 14, marginBottom: 14 }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}><KeyRound size={17} /> Kode Aktivasi — {codeInfo.name}</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>KODE MANUAL (input di scan warga):</p>
            <strong style={{ fontSize: 24, letterSpacing: 3 }}>{codeInfo.code}</strong>
            <p style={{ margin: '4px 0', fontSize: 12.5 }}>Berlaku 15 menit & sekali pakai.</p></div>
          {codeInfo.qr && <img src={codeInfo.qr} alt="QR aktivasi" style={{ width: 120, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', padding: 4 }} />}
        </div>
        <p style={{ margin: '6px 0 10px', fontSize: 13 }}>QR berisi tautan aktivasi — bisa discan langsung dengan kamera HP warga (otomatis terbuka), atau warga ketik <strong>Kode Manual</strong> di atas lewat menu scan di aplikasi.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {codeInfo.qr && <button className="btn btn-ghost" onClick={() => downloadQr(codeInfo.qr, `qr-aktivasi-${codeInfo.name}.png`)}><Download size={15} /> Unduh QR</button>}
          {codeInfo.qr && <button className="btn btn-ghost" onClick={() => printQr(codeInfo.qr, 'Aktivasi Akun Warga', `${codeInfo.name} — kode ${codeInfo.code}`)}><Printer size={15} /> Cetak</button>}
          <button className="btn btn-ghost" onClick={() => setCodeInfo(null)}>Tutup</button>
        </div>
      </div>
    )}

    {loading ? <p className="muted-text">Memuat data...</p> : rows.length === 0 ? <p className="muted-text">Data belum ditemukan.</p> : (
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr>{meta.columns.map(([, label]) => <th key={label}>{label}</th>)}{(showActions || ['households', 'rts', 'emergency_contacts', 'health_workers', 'profiles'].includes(resource)) && <th>Aksi</th>}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row[Object.keys(row)[0]]}>
            {meta.columns.map(([key, label]) => {
              if (meta.roleControl && key === 'role') {
                const targetTier = getTier(row)
                const canModifyRole = callerTier < targetTier
                const canSetAdmin = isTier1
                return (
                  <td key={key} data-label={label}>
                    <select
                      value={row.role}
                      disabled={busyId === row.user_id || !canModifyRole}
                      onChange={(event) => void changeRole(row, event.target.value)}
                      style={{ minHeight: 40, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 10, background: canModifyRole ? '#fff' : '#f3f4f6', fontSize: 13 }}
                      aria-label={`Role ${row.display_name ?? row.email ?? ''}`}
                      title={!canModifyRole ? `Tidak berwenang mengubah ${tierLabel(targetTier)} (Tier ${targetTier})` : ''}
                    >
                      <option value="warga">Warga (Tier 5)</option>
                      <option value="nakes">Nakes (Tier 4)</option>
                      <option value="admin" disabled={!canSetAdmin}>{isTier1 ? 'Admin' : 'Admin (khusus owner)'}</option>
                    </select>
                  </td>
                )
              }
              const cellContent = meta.renderCell ? meta.renderCell(key, row[key], row) : formatCell(key, row[key])
              return <td key={key} data-label={label}>{cellContent}</td>
            })}
            {showActions && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">
              <button className="btn btn-ghost table-action" onClick={() => navigate(`/admin/warga/${row.citizen_id}`)}>Detail</button>
              <button className="btn btn-ghost table-action" onClick={() => setEditing({ ...row })}><Save size={14} /> Ubah</button>
              {row.is_active && <button className="btn btn-ghost table-action" onClick={() => void makeActivationCode(row)}><KeyRound size={14} /> Kode Aktivasi</button>}
              <DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} secondary={row.google_connected ? { label: 'Ya + akun Google', onConfirm: () => void removeResource(row, true) } : null} />
            </td>}
            {resource === 'households' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => void openMembers(row)}>Anggota</button><DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} /></td>}
            {resource === 'rts' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => setRtForm({ rt_id: row.rt_id, code: row.code, name: row.name })}>Ubah nama</button><DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} /></td>}
            {resource === 'health_workers' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi"><button className="btn btn-ghost table-action" onClick={() => setEditing({ ...row })}><Save size={14} /> Ubah</button><DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} /></td>}
            {resource === 'profiles' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">{(() => {
              const targetTier = getTier(row)
              const isSelf = row.user_id === access?.user_id
              const canDelete = !isSelf && callerTier < targetTier && targetTier !== 1
              if (!canDelete) {
                if (isSelf) return <span className="muted-text" style={{ fontSize: 12 }}>Akun sendiri</span>
                if (targetTier === 1) return <span className="muted-text" style={{ fontSize: 12 }}>Owner tidak dapat dihapus</span>
                if (callerTier >= targetTier) return <span className="muted-text" style={{ fontSize: 12 }}>Hanya tier lebih tinggi bisa hapus ({tierLabel(callerTier)} Tier {callerTier} → {tierLabel(targetTier)} Tier {targetTier})</span>
                return <span className="muted-text" style={{ fontSize: 12 }}>—</span>
              }
              return <DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} warning="Akun + semua data terhubung akan dihapus permanen." />
            })()}</td>}
            {resource === 'emergency_contacts' && <td style={{ whiteSpace: 'normal' }} data-label="Aksi">
              <button className="btn btn-ghost table-action" disabled={busyId === row.emergency_contact_id} onClick={() => void moveContact(row, 'up')} aria-label={`Naikkan urutan ${row.label}`}><ChevronUp size={14} /> Naik</button>
              <button className="btn btn-ghost table-action" disabled={busyId === row.emergency_contact_id} onClick={() => void moveContact(row, 'down')} aria-label={`Turunkan urutan ${row.label}`}><ChevronDown size={14} /> Turun</button>
              <button className="btn btn-ghost table-action" onClick={() => setEditing({ ...row })}><Save size={14} /> Ubah</button>
              <DeleteAction row={row} deleteId={deleteId} setDeleteId={setDeleteId} busyId={busyId} onConfirm={() => void removeResource(row)} />
            </td>}
          </tr>)}
        </tbody>
      </table></div>
    )}

    {members && (
      <div className="admin-panel" style={{ marginTop: 14 }}>
        <div className="staff-panel-head"><div><h2>Anggota KK {members.household.household_number}</h2><p>{members.household.head_name} · {members.household.rt_code}</p></div><button className="btn btn-ghost" onClick={() => setMembers(null)}>Tutup</button></div>
        <div className="record-table">{(members.list ?? []).map((member) => (
          <div className="record-row" key={member.citizen_id}>
            <div><strong>{member.full_name}</strong><small>{member.family_relation || 'Anggota'} · NIK ****{member.nik_last4}</small></div>
            <span>{member.google_connected ? '🟢 Terhubung' : '🟡 Belum terhubung'}</span>
          </div>
        ))}{(members.list ?? []).length === 0 && <p className="muted-text">Belum ada anggota pada KK ini.</p>}</div>
      </div>
    )}
  </div></div>
}

function rowIdOf(row) { return row.citizen_id || row.household_id || row.rt_id || row.health_worker_id || row.user_id || row.emergency_contact_id || row.audit_log_id }
function rowNameOf(row) { return row.full_name || row.label || row.household_number || row.code || row.email || row.title || 'data ini' }

function DeleteAction({ row, deleteId, setDeleteId, busyId, onConfirm, secondary, warning }) {
  const id = rowIdOf(row)
  if (deleteId !== id) {
    return <button className="btn btn-danger table-action" disabled={busyId === id} onClick={() => setDeleteId(id)}><Trash2 size={14} /> Hapus</button>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#b42318' }}>
        Hapus "{rowNameOf(row)}"?{warning && <small style={{ display: 'block', maxWidth: 260, fontWeight: 500, color: '#9b5148' }}>{warning}</small>}
      </span>
      <button className="btn btn-danger table-action" disabled={busyId === id} onClick={onConfirm}><Trash2 size={14} /> Ya, hapus</button>
      {secondary && <button className="btn btn-danger table-action" disabled={busyId === id} onClick={secondary.onConfirm}><UserX size={14} /> {secondary.label}</button>}
      <button className="btn btn-ghost table-action" disabled={busyId === id} onClick={() => setDeleteId(null)}>Batal</button>
    </span>
  )
}

function TierManager({ onDone }) {
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState('2')
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setMsg(null)
    try {
      // Need user_id from email -> find via listAdmin then set tier
      const { supabase } = await import('../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Belum login')
      // Lookup user_id by email via list_admin_profiles
      const rows = await listAdmin('profiles', email.trim())
      const target = rows.find(r => (r.email || '').toLowerCase() === email.trim().toLowerCase())
      if (!target) throw new Error('Email tidak ditemukan di daftar profiles. Pastikan user sudah pernah login.')
      await setAdminTier(target.user_id, Number(tier))
      setMsg({ ok: true, text: `✅ ${target.display_name || target.email} sekarang ${tierLabel(Number(tier))} (Tier ${tier})` })
      setEmail('')
      if (onDone) await onDone()
    } catch (err) { setMsg({ ok: false, text: err.message || 'Gagal set tier.' }) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <div className="field-grid">
        <label>Email admin target<input required type="email" placeholder="admin@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>Tier<select value={tier} onChange={e=>setTier(e.target.value)}><option value="2">Tier 2 Senior</option><option value="3">Tier 3 Junior</option></select></label>
      </div>
      {msg && <p style={{ color: msg.ok ? 'var(--teal-dark)' : '#b42318', fontSize: 13, margin: '10px 0 0' }}>{msg.text}</p>}
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={saving || !email.trim()}><ShieldCheck size={16} /> {saving ? 'Menyimpan...' : 'Set Tier'}</button>
    </form>
  )
}

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
