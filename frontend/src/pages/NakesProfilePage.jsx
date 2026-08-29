import { useEffect, useState } from 'react'
import { Camera, Save, ArrowLeft, User, Phone, Award, Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { getMyNakesProfile, updateMyNakesProfile, uploadNakesAvatar, getWorkerAvatarUrl } from '../features/nakes/nakesProfileService'

export function NakesProfilePage() {
  const { access } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ full_name: '', position: '', specialty: '', phone: '', whatsapp_number: '', work_status: 'Sedang bertugas', is_siaga: false, services: '', schedule: '' })
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await getMyNakesProfile()
      if (data) {
        setProfile(data)
        setForm({
          full_name: data.full_name || access?.display_name || '',
          position: data.position || 'Tenaga Kesehatan Desa',
          specialty: data.specialty || '',
          phone: data.phone || '',
          whatsapp_number: data.whatsapp_number || data.phone || '',
          work_status: data.work_status || (data.is_online ? 'Sedang bertugas' : 'Tidak sedang bertugas'),
          is_siaga: Boolean(data.is_siaga),
          services: Array.isArray(data.services) ? data.services.join(', ') : (data.services || data.specialty || ''),
          schedule: data.schedule || 'Senin - Jumat, 08.00 - 15.00',
        })
        const avatar = getWorkerAvatarUrl(data)
        if (avatar) setAvatarPreview(avatar)
      } else {
        setForm(f => ({ ...f, full_name: access?.display_name || '' }))
      }
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const url = URL.createObjectURL(file)
    setAvatarPreview(url)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    try {
      let avatarUrl = avatarPreview
      if (avatarFile) {
        avatarUrl = await uploadNakesAvatar(avatarFile)
      }
      const payload = {
        full_name: form.full_name,
        position: form.position,
        specialty: form.specialty || form.services,
        phone: form.phone,
        whatsapp_number: form.whatsapp_number,
        avatar_url: avatarUrl,
        work_status: form.work_status,
        is_siaga: form.is_siaga,
        services: form.services,
        schedule: form.schedule,
      }
      const res = await updateMyNakesProfile(payload)
      setSuccess(res.warning ? `${res.warning}` : 'Profil berhasil diperbarui. Perubahan akan tampil di halaman Tim Kesehatan dan Landing Page.')
      await load()
    } catch (e) { setError(e.message || 'Gagal menyimpan') } finally { setSaving(false) }
  }

  if (loading) return <div className="staff-page"><div className="container narrow-container"><p className="muted-text">Memuat profil...</p></div></div>

  const initials = (form.full_name || '?').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()

  return <div className="staff-page"><div className="container narrow-container">
    <Link to="/nakes" className="back-link"><ArrowLeft size={15}/> Kembali ke Dashboard</Link>
    <div className="form-heading"><div className="icon-tile"><User size={18}/></div><div><div className="eyebrow">Profil Nakes</div><h1 className="display">Profil Saya</h1></div></div>
    <p className="page-intro">Kelola profil Anda. Foto yang diunggah akan tampil di halaman Tim Kesehatan Desa dan bagian Tim di Landing Page.</p>
    {error && <div className="staff-alert">{error}</div>}
    {success && <div className="form-success">{success}</div>}

    <form onSubmit={handleSave} className="staff-form" style={{marginTop:16}}>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:14, marginBottom:18}}>
        <div style={{position:'relative'}}>
          {avatarPreview ? <img src={avatarPreview} alt="Avatar" style={{width:96,height:96,borderRadius:'50%',objectFit:'cover',border:'3px solid var(--line)',boxShadow:'0 6px 20px rgba(15,118,110,.15)'}}/> : <div className="avatar large" style={{width:96,height:96,fontSize:28}}>{initials}</div>}
          <label htmlFor="avatar-upload" style={{position:'absolute', right:0, bottom:0, width:32,height:32, borderRadius:'50%', background:'var(--teal)', color:'white', display:'grid', placeItems:'center', cursor:'pointer', border:'2px solid white', boxShadow:'0 4px 12px rgba(0,0,0,.15)'}}><Camera size={16}/></label>
        </div>
        <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarChange} style={{display:'none'}}/>
        <small className="muted-text">Klik ikon kamera untuk ganti foto (max 2MB, JPG/PNG)</small>
      </div>

      <div className="field-grid">
        <label>Nama lengkap<input required value={form.full_name} onChange={e=>setForm({...form, full_name:e.target.value})} placeholder="Nama Anda"/></label>
        <label>Jabatan<input required value={form.position} onChange={e=>setForm({...form, position:e.target.value})} placeholder="Tenaga Kesehatan Desa"/></label>
      </div>
      <div className="field-grid">
        <label>Keahlian / Layanan<input value={form.specialty} onChange={e=>setForm({...form, specialty:e.target.value})} placeholder="Pemeriksaan umum, Tekanan darah"/></label>
        <label>Nomor telepon<input type="tel" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} placeholder="08xxxxxxxxxx"/></label>
      </div>
      <div className="field-grid">
        <label>WhatsApp<input type="tel" value={form.whatsapp_number} onChange={e=>setForm({...form, whatsapp_number:e.target.value})} placeholder="08xxxxxxxxxx (untuk tombol WA)"/></label>
        <label>Status<select value={form.work_status} onChange={e=>setForm({...form, work_status:e.target.value})}><option>Sedang bertugas</option><option>Sedang menangani warga</option><option>Tidak sedang bertugas</option><option>Tidak tersedia</option></select></label>
      </div>
      <div className="field-grid">
        <label>Layanan (pisahkan koma)<input value={form.services} onChange={e=>setForm({...form, services:e.target.value})} placeholder="Pemeriksaan umum, Gula darah"/></label>
        <label>Jadwal pelayanan<input value={form.schedule} onChange={e=>setForm({...form, schedule:e.target.value})} placeholder="Senin - Jumat, 08.00 - 15.00"/></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={form.is_siaga} onChange={e=>setForm({...form, is_siaga:e.target.checked})}/> <span>Petugas Siaga <small>Jika aktif, Anda akan tampil di section "Petugas Siaga Saat Ini" di halaman Tim Kesehatan</small></span></label>

      <div className="form-actions"><Link to="/nakes" className="btn btn-ghost">Batal</Link><button className="btn btn-primary" disabled={saving}><Save size={16}/> {saving ? 'Menyimpan...' : 'Simpan Profil'}</button></div>
    </form>

    <div className="staff-panel" style={{marginTop:16}}>
      <h2 style={{display:'flex', alignItems:'center', gap:8}}><Briefcase size={18}/> Preview Card di Landing Page</h2>
      <p className="muted-text" style={{marginTop:4}}>Seperti ini foto Anda akan tampil di landing page & tim kesehatan.</p>
      <div className="team-grid" style={{marginTop:14}}>
        <div className="team-card">
          {avatarPreview ? <img src={avatarPreview} alt={form.full_name} style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}}/> : <div className="avatar">{initials}</div>}
          <div><h3>{form.full_name || 'Nama Anda'}</h3><p>{form.position} · {form.specialty || 'Tenaga Kesehatan'}</p><span className="online" style={{color: form.work_status==='Sedang bertugas' ? '#15803d' : 'var(--muted)'}}>{form.work_status}</span></div>
        </div>
      </div>
    </div>
  </div></div>
}
