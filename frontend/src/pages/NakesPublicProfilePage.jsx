import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Phone, MessageCircle, MapPin, Building2, Calendar, Clock, Stethoscope, ShieldCheck, AlertTriangle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getWorkerAvatarUrl } from '../features/nakes/nakesProfileService'

const statusCfg = {
  'Sedang bertugas': { icon: '🟢', color: '#15803d', bg: '#f0fdf4' },
  'Sedang menangani warga': { icon: '🟠', color: '#ea580c', bg: '#fff7ed' },
  'Tidak sedang bertugas': { icon: '⚪', color: '#6b7280', bg: '#f9fafb' },
  'Tidak tersedia': { icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
}

export function NakesPublicProfilePage() {
  const { id } = useParams()
  const [worker, setWorker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('')
      try {
        if (!isSupabaseConfigured || !supabase) {
          setError('Database belum terhubung'); setLoading(false); return
        }
        // Try by health_worker_id first, then by user_id
        let { data, error: err } = await supabase.from('health_workers').select('*').eq('health_worker_id', id).maybeSingle()
        if (!data) {
          const { data: byUser } = await supabase.from('health_workers').select('*').eq('user_id', id).maybeSingle()
          data = byUser
        }
        if (err) throw err
        if (!data) { setError('Profil tenaga kesehatan tidak ditemukan.'); setLoading(false); return }
        // enrich avatar via local storage
        const avatar = getWorkerAvatarUrl(data)
        if (avatar) data.avatar_url = avatar
        setWorker(data)
      } catch (e) { setError(e.message || 'Gagal memuat profil') } finally { setLoading(false) }
    }
    void load()
  }, [id])

  // realtime subscription for this worker
  useEffect(() => {
    if (!supabase || !id) return
    const ch = supabase.channel(`nakes-profile-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'health_workers', filter: `health_worker_id=eq.${id}` }, (payload) => {
      if (payload.new) {
        const avatar = getWorkerAvatarUrl(payload.new)
        setWorker(prev => ({ ...(prev || {}), ...payload.new, avatar_url: avatar || payload.new.avatar_url }))
      }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  if (loading) return <main className="dashboard-page"><div className="container narrow-container"><p className="muted-text">Memuat profil...</p><div style={{height:200, background:'#f3f4f6', borderRadius:16, marginTop:12, animation:'pulse 1.5s infinite'}}/></div></main>
  if (error) return <main className="dashboard-page"><div className="container narrow-container"><Link to="/tim-kesehatan" className="back-link"><ArrowLeft size={15}/> Kembali ke Tim Kesehatan</Link><div className="staff-panel" style={{textAlign:'center', marginTop:16}}><AlertTriangle size={24} color="#b42318"/><p style={{color:'#b42318', fontWeight:700, margin:'10px 0 6px'}}>Profil tenaga kesehatan tidak ditemukan.</p><p className="muted-text">{error}</p><Link to="/tim-kesehatan" className="btn btn-primary" style={{marginTop:12}}>Kembali ke Tim Kesehatan</Link></div></div></main>
  if (!worker) return null

  const cfg = statusCfg[worker.work_status] || statusCfg[worker.is_online ? 'Sedang bertugas' : 'Tidak sedang bertugas']
  const initials = (worker.full_name || '?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()
  const services = worker.services ? (Array.isArray(worker.services) ? worker.services : String(worker.services).split(',').map(s=>s.trim()).filter(Boolean)) : (worker.specialty ? String(worker.specialty).split(',').map(s=>s.trim()).filter(Boolean) : [])
  const joinedYear = worker.created_at ? new Date(worker.created_at).getFullYear() : '2026'
  const waUrl = (phone) => {
    const d = String(phone||'').replace(/\D/g,'')
    if (!d) return null
    if (d.startsWith('62')) return `https://wa.me/${d}`
    if (d.startsWith('0')) return `https://wa.me/62${d.slice(1)}`
    if (d.startsWith('8')) return `https://wa.me/62${d}`
    return null
  }
  const formatPhone = (p) => {
    const d = String(p||'').replace(/\D/g,'')
    if (!d) return ''
    if (d.startsWith('62')) return `+${d}`
    if (d.startsWith('0')) return d
    return d
  }

  return <main className="dashboard-page"><div className="container narrow-container">
    <Link to="/tim-kesehatan" className="back-link"><ArrowLeft size={15}/> Kembali ke Tim Kesehatan</Link>

    <div className="eyebrow" style={{marginTop:14}}>Tim kesehatan desa</div>
    <h1 className="display" style={{margin:'4px 0 0', fontSize:'clamp(22px,4vw,28px)'}}>Profil Tenaga Kesehatan</h1>

    <div className="staff-panel" style={{marginTop:16, display:'grid', gap:20, textAlign:'center', padding:28}}>
      <div style={{display:'grid', justifyItems:'center', gap:12}}>
        {worker.avatar_url ? <img src={worker.avatar_url} alt={worker.full_name} style={{width:96,height:96,borderRadius:'50%',objectFit:'cover', border:'3px solid var(--line)', boxShadow:'0 8px 20px rgba(0,0,0,.08)'}} onError={e=>{e.currentTarget.style.display='none'}}/> : <div className="avatar" style={{width:96,height:96, fontSize:28, borderRadius:'50%'}}>{initials}</div>}
        <div>
          <h2 className="display" style={{margin:0, fontSize:22}}>{worker.full_name}</h2>
          <p style={{margin:'4px 0 0', color:'var(--muted)', fontSize:13}}>{worker.position || 'Tenaga Kesehatan Desa'}</p>
          <div style={{marginTop:8, display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:999, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.color}30`, fontSize:12, fontWeight:700}}>{cfg.icon} {worker.work_status || (worker.is_online ? 'Sedang bertugas' : 'Tidak sedang bertugas')}</div>
          {worker.is_siaga && <div style={{marginTop:6, display:'inline-flex', padding:'3px 8px', borderRadius:999, background:'#16a34a', color:'white', fontSize:10, fontWeight:800, marginLeft:6}}>● Siaga</div>}
        </div>
      </div>
      <div style={{display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap'}}>
        {worker.phone ? <a href={`tel:${formatPhone(worker.phone)}`} className="btn btn-primary"><Phone size={16}/> Hubungi</a> : <span className="muted-text" style={{padding:'10px 14px', border:'1px dashed var(--line)', borderRadius:12}}>Kontak belum tersedia.</span>}
        {waUrl(worker.whatsapp_number || worker.phone) && <a href={waUrl(worker.whatsapp_number || worker.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{borderColor:'#25D366', color:'#128C7E', background:'white'}}><MessageCircle size={16}/> WhatsApp</a>}
      </div>
    </div>

    <div className="staff-panel" style={{marginTop:16}}>
      <h3 style={{margin:'0 0 6px', fontSize:15}}>Profil singkat</h3>
      <p className="muted-text" style={{margin:0, lineHeight:1.6}}>Tenaga kesehatan yang membantu pelayanan kesehatan warga Desa Sehat Kenanga. Berkomitmen memberikan pemeriksaan rutin, edukasi, dan pendampingan kesehatan keluarga.</p>
    </div>

    <div className="staff-panel" style={{marginTop:16}}>
      <h3 style={{margin:'0 0 12px', fontSize:15}}>Informasi profesional</h3>
      <div style={{display:'grid', gap:12}}>
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}><MapPin size={18} color="var(--teal)" style={{marginTop:2}}/><div><strong style={{fontSize:13}}>Wilayah pelayanan</strong><div className="muted-text" style={{fontSize:13}}>Desa Sehat Kenanga</div></div></div>
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}><Building2 size={18} color="var(--teal)" style={{marginTop:2}}/><div><strong style={{fontSize:13}}>Tempat bertugas</strong><div className="muted-text" style={{fontSize:13}}>Pos Kesehatan Desa</div></div></div>
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}><Stethoscope size={18} color="var(--teal)" style={{marginTop:2}}/><div><strong style={{fontSize:13}}>Fokus pelayanan</strong><div className="muted-text" style={{fontSize:13}}>{worker.specialty || 'Pemeriksaan kesehatan warga'}</div></div></div>
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}><Clock size={18} color="var(--teal)" style={{marginTop:2}}/><div><strong style={{fontSize:13}}>Jadwal pelayanan</strong><div className="muted-text" style={{fontSize:13}}>{worker.schedule || 'Senin - Jumat, 08.00 - 15.00'}</div></div></div>
        <div style={{display:'flex', gap:12, alignItems:'flex-start'}}><Calendar size={18} color="var(--teal)" style={{marginTop:2}}/><div><strong style={{fontSize:13}}>Bergabung sejak</strong><div className="muted-text" style={{fontSize:13}}>{joinedYear}</div></div></div>
      </div>
    </div>

    <div className="staff-panel" style={{marginTop:16}}>
      <h3 style={{margin:'0 0 10px', fontSize:15}}>Layanan yang dapat dibantu</h3>
      {services.length===0 ? <p className="muted-text">Informasi layanan belum tersedia.</p> : <div style={{display:'flex', flexWrap:'wrap', gap:8}}>{services.map(s=> <span key={s} style={{padding:'6px 12px', borderRadius:999, background:'#f0faf7', border:'1px solid var(--line)', fontSize:12, fontWeight:600, color:'var(--teal-dark)'}}>{s}</span>)}</div>}
    </div>

    <div className="staff-panel" style={{marginTop:16, background:'#fff7ed', borderColor:'#fed7aa'}}>
      <h3 style={{margin:'0 0 6px', display:'flex', alignItems:'center', gap:8, color:'#9a3412'}}>🚨 Butuh bantuan?</h3>
      <p className="muted-text" style={{margin:0}}>Jika warga membutuhkan bantuan kesehatan, warga dapat menghubungi petugas.</p>
      <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap'}}>
        {worker.phone ? <a href={`tel:${formatPhone(worker.phone)}`} className="btn btn-primary">Hubungi Petugas</a> : <Link to="/tim-kesehatan" className="btn btn-ghost" style={{background:'white'}}>Lihat petugas lain</Link>}
        <Link to="/tim-kesehatan" className="btn btn-ghost" style={{background:'white'}}>Kembali ke daftar</Link>
      </div>
      <p style={{margin:'10px 0 0', fontSize:11, color:'#9a3412'}}><ShieldCheck size={11}/> Untuk kondisi gawat darurat, segera hubungi IGD/puskesmas terdekat.</p>
    </div>
  </div></main>
}
