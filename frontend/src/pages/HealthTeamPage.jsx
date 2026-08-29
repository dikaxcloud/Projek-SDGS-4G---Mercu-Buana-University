import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, Phone, MessageCircle, Search, Filter, AlertTriangle, RefreshCw, Stethoscope, Clock, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getPublicLandingData } from '../features/health/healthService'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getWorkerAvatarUrl } from '../features/nakes/nakesProfileService'

function normalizeWorkers(raw) {
  return (raw || []).map(w => ({
    id: w.health_worker_id || w.user_id || w.name,
    health_worker_id: w.health_worker_id || null,
    name: w.full_name || w.name,
    role: w.position || w.role || 'Tenaga Kesehatan Desa',
    specialty: w.specialty || w.services || '',
    phone: w.phone || '',
    whatsapp: w.whatsapp_number || w.whatsapp || w.phone || '',
    is_online: Boolean(w.is_online),
    is_active: w.is_active !== false,
    avatar_url: w.avatar_url || null,
    work_status: w.work_status || (w.is_online ? 'Sedang bertugas' : 'Tidak sedang bertugas'),
    is_siaga: Boolean(w.is_siaga),
    services: w.services ? (Array.isArray(w.services) ? w.services : String(w.services).split(',').map(s=>s.trim()).filter(Boolean)) : (w.specialty ? String(w.specialty).split(',').map(s=>s.trim()).filter(Boolean) : []),
    schedule: w.schedule || 'Senin - Jumat, 08.00 - 15.00',
    user_id: w.user_id || null,
    raw: w,
  }))
}

const statusConfig = {
  'Sedang bertugas': { icon: '🟢', color: '#15803d', bg: '#f0fdf4' },
  'Sedang menangani warga': { icon: '🟠', color: '#ea580c', bg: '#fff7ed' },
  'Tidak sedang bertugas': { icon: '⚪', color: '#6b7280', bg: '#f9fafb' },
  'Tidak tersedia': { icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
}

export function HealthTeamPage() {
  const [workers, setWorkers] = useState([])
  const [emergencyContacts, setEmergencyContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      // Fetch landing workers + extended health_workers for avatar etc
      let list = []
      try {
        const data = await getPublicLandingData()
        list = normalizeWorkers(data?.workers ?? [])
        // enrich with full health_workers table if available
        if (isSupabaseConfigured && supabase) {
          const { data: full } = await supabase.from('health_workers').select('*').eq('is_active', true)
          if (full && full.length) {
            const map = new Map(full.map(f => [f.full_name?.toLowerCase(), f]))
            list = list.map(w => {
              const extra = map.get(w.name?.toLowerCase())
              if (extra) return normalizeWorkers([ { ...extra, name: extra.full_name } ])[0]
              return w
            })
            // add any missing from table not in landing (in case landing filtered)
            full.forEach(f => {
              if (!list.some(l => l.name.toLowerCase() === f.full_name.toLowerCase())) {
                list.push(normalizeWorkers([{ ...f, name: f.full_name }])[0])
              }
            })
          }
        }
      } catch {}
      // fallback demo if empty
      if (list.length === 0 && !isSupabaseConfigured) {
        list = normalizeWorkers([
          { name: 'Siti Rahmawati', role: 'Bidan Desa', specialty: 'Kesehatan ibu & anak', is_online: true, phone: '081200000001', work_status: 'Sedang bertugas', is_siaga: true },
          { name: 'Dedi Prasetyo', role: 'Perawat Desa', specialty: 'Pemeriksaan umum, Tekanan darah', is_online: true, phone: '081200000002', work_status: 'Sedang menangani warga' },
        ])
      }
      // try to merge local avatar
      list = list.map(w => {
        const avatar = getWorkerAvatarUrl({ ...w, user_id: w.user_id, avatar_url: w.avatar_url })
        return { ...w, avatar_url: avatar || w.avatar_url }
      })
      setWorkers(list)

      // emergency contacts
      if (isSupabaseConfigured && supabase) {
        const { data: contacts } = await supabase.from('emergency_contacts').select('*').eq('is_active', true).order('sort_order')
        if (contacts) setEmergencyContacts(contacts)
      }
    } catch (e) { setError(e.message || 'Gagal memuat') } finally { setLoading(false) }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 30000);
    // realtime subscription for health_workers
    let channel = null
    if (isSupabaseConfigured && supabase) {
      channel = supabase.channel('health-team-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'health_workers' }, () => void load()).subscribe()
    }
    return () => { clearInterval(t); if (channel) supabase.removeChannel(channel) }
  }, [])
  // ESC to close modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null) }
    if (selected) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const filtered = useMemo(() => {
    let r = workers
    if (filter === 'Sedang Bertugas') r = r.filter(w => w.work_status === 'Sedang bertugas' || w.is_online)
    else if (filter === 'Siaga') r = r.filter(w => w.is_siaga)
    else if (filter === 'Tidak Bertugas') r = r.filter(w => w.work_status === 'Tidak sedang bertugas' || !w.is_online)
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter(w => w.name.toLowerCase().includes(q) || w.role.toLowerCase().includes(q) || w.specialty.toLowerCase().includes(q))
    }
    return r
  }, [workers, filter, query])

  const totalPetugas = workers.length
  const sedangBertugas = workers.filter(w => w.is_online || w.work_status === 'Sedang bertugas').length
  const siagaCount = workers.filter(w => w.is_siaga).length
  const siagaWorkers = workers.filter(w => w.is_siaga)

  const formatPhone = (p) => {
    const d = String(p||'').replace(/\D/g,'')
    if (!d) return ''
    if (d.startsWith('62')) return `+${d}`
    if (d.startsWith('0')) return d
    return d
  }
  const waUrl = (phone) => {
    const d = String(phone||'').replace(/\D/g,'')
    if (!d) return null
    if (d.startsWith('62')) return `https://wa.me/${d}`
    if (d.startsWith('0')) return `https://wa.me/62${d.slice(1)}`
    if (d.startsWith('8')) return `https://wa.me/62${d}`
    return null
  }

  return <main className="dashboard-page"><div className="container narrow-container">
    <Link className="back-link" to="/"><ArrowLeft size={15}/> Beranda</Link>

    {/* HEADER */}
    <div className="form-heading" style={{marginTop:14}}><div className="icon-tile"><Stethoscope size={18}/></div><div><div className="eyebrow">Tim kesehatan desa</div><h1 className="display">Tenaga kesehatan</h1></div></div>
    <p className="page-intro">Temukan tenaga kesehatan desa yang tersedia dan hubungi petugas yang sesuai dengan kebutuhan Anda.</p>

    {/* QUICK STATS */}
    <div className="stats-grid" style={{marginTop:18, gridTemplateColumns:'repeat(3,1fr)'}}>
      <div className="stat-card" style={{textAlign:'center'}}><strong style={{fontSize:28}}>{loading ? '—' : totalPetugas}</strong><span>Total Petugas</span></div>
      <div className="stat-card" style={{textAlign:'center', borderColor: sedangBertugas? '#bbf7d0': undefined}}><strong style={{fontSize:28, color: sedangBertugas? '#15803d': undefined}}>{loading ? '—' : sedangBertugas}</strong><span>Sedang Bertugas</span></div>
      <div className="stat-card" style={{textAlign:'center', borderColor: siagaCount? '#fed7aa': undefined}}><strong style={{fontSize:28, color: siagaCount? '#c2410c': undefined}}>{loading ? '—' : siagaCount}</strong><span>Petugas Siaga</span></div>
    </div>

    {/* PETUGAS SIAGA SAAT INI */}
    <section style={{marginTop:28}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}><h2 className="display" style={{fontSize:22, margin:0}}>Petugas Siaga Saat Ini</h2><span style={{padding:'2px 8px', borderRadius:999, background:'#fef2f2', color:'#b42318', fontSize:11, fontWeight:800, border:'1px solid #fecaca'}}>● LIVE</span></div>
      <p className="muted-text" style={{margin:'0 0 12px'}}>Petugas yang dapat dihubungi untuk membantu kebutuhan kesehatan warga.</p>
      {siagaWorkers.length === 0 ? <div className="staff-panel" style={{textAlign:'center', padding:20}}><p className="muted-text">Belum ada petugas yang sedang siaga.</p><small className="muted-text">Jika butuh bantuan, lihat daftar tenaga kesehatan di bawah atau hubungi kontak darurat.</small></div> : <div className="team-grid">
        {siagaWorkers.map(w => (
          <div key={w.id} className="team-card" style={{borderColor:'#fed7aa', background:'#fff7ed', position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute', top:10, right:10, padding:'3px 8px', borderRadius:999, background:'#16a34a', color:'white', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', gap:4}}><span style={{width:8,height:8,borderRadius:'50%', background:'white', display:'inline-block'}}/> Siaga</div>
            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              {w.avatar_url ? <img src={w.avatar_url} alt={w.name} style={{width:44,height:44,borderRadius:'50%',objectFit:'cover', border:'2px solid white', boxShadow:'0 4px 12px rgba(0,0,0,.1)'}}/> : <div className="avatar" style={{width:44,height:44}}>{w.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>}
              <div><h3 style={{margin:0}}>{w.name}</h3><p style={{margin:'2px 0 0', color:'var(--muted)', fontSize:12}}>{w.role}</p></div>
            </div>
            <div style={{marginTop:12, display:'flex', flexWrap:'wrap', gap:6}}>
              {(w.services.length? w.services : ['Pemeriksaan umum']).slice(0,3).map(s=> <span key={s} style={{padding:'4px 8px', borderRadius:999, background:'white', border:'1px solid #fed7aa', fontSize:11, color:'#9a3412', fontWeight:600}}>🩺 {s}</span>)}
            </div>
            <div style={{marginTop:12, display:'flex', gap:8}}>
              <Link to={`/tim-kesehatan/${w.health_worker_id || w.id}`} className="btn btn-ghost" style={{flex:1, minHeight:40, fontSize:13, background:'white', borderColor:'var(--teal)', color:'var(--teal)'}}>Lihat profil</Link>
              <button className="btn btn-ghost" style={{flex:1, minHeight:40, fontSize:13, background:'white'}} onClick={()=>setSelected(w)}>Hubungi</button>
            </div>
            <div style={{marginTop:8, display:'flex', gap:8}}>
              <a href={`tel:${formatPhone(w.phone)}`} className="btn btn-primary" style={{flex:1, minHeight:40, fontSize:13}}><Phone size={14}/> Telepon</a>
              {waUrl(w.whatsapp) && <a href={waUrl(w.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{flex:1, minHeight:40, fontSize:13, background:'white'}}><MessageCircle size={14}/> WhatsApp</a>}
            </div>
            <div style={{marginTop:8, display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)'}}><Clock size={12}/> {w.schedule}</div>
          </div>
        ))}
      </div>}
    </section>

    {/* FILTER + SEARCH */}
    <div className="admin-toolbar" style={{marginTop:28, flexWrap:'wrap', gap:10}}>
      <label className="search-field" style={{flex:'1 1 200px', minWidth:200}}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama, jabatan, layanan..." aria-label="Cari petugas"/></label>
      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
        {['Semua','Sedang Bertugas','Siaga','Tidak Bertugas'].map(f=> <button key={f} onClick={()=>setFilter(f)} className="btn" style={{minHeight:40, padding:'0 14px', fontSize:13, background: filter===f? 'var(--teal)': 'white', color: filter===f? 'white':'var(--muted)', border:'1px solid var(--line)', fontWeight:700}}>{f}</button>)}
      </div>
    </div>

    {/* SEMUA TENAGA KESEHATAN */}
    <section style={{marginTop:18}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}><h2 className="display" style={{fontSize:20, margin:0}}>Semua Tenaga Kesehatan</h2><span className="muted-text" style={{fontSize:12}}>{filtered.length} petugas</span></div>
      {loading ? <div className="staff-panel" style={{display:'grid', gap:10}}>{[1,2,3].map(i=> <div key={i} style={{height:80, background:'#f3f4f6', borderRadius:12, animation:'pulse 1.5s infinite'}}/>)}</div>
      : error ? <div className="staff-panel" style={{textAlign:'center'}}><AlertTriangle size={20} color="#b42318"/><p style={{color:'#b42318', margin:'8px 0 4px'}}>Data tenaga kesehatan tidak dapat dimuat.</p><p className="muted-text" style={{margin:0}}>{error}</p><button className="btn btn-ghost" style={{marginTop:12}} onClick={load}><RefreshCw size={14}/> Coba lagi</button></div>
      : filtered.length===0 ? <div className="staff-panel" style={{textAlign:'center'}}><p className="muted-text">Belum ada tenaga kesehatan yang tersedia.</p></div>
      : <div className="team-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))'}}>
        {filtered.map((w, idx)=> {
          const cfg = statusConfig[w.work_status] || statusConfig['Tidak sedang bertugas']
          return <div key={w.id} className="team-card" style={{display:'grid', gap:10, animation:`welcome-fade-up .35s ease both`, animationDelay: `${idx*60}ms`}}>
            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              {w.avatar_url ? <img src={w.avatar_url} alt={w.name} style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}}/> : <div className="avatar">{w.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>}
              <div style={{flex:1, minWidth:0}}><h3 style={{margin:0, fontSize:15, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{w.name}</h3><p style={{margin:'2px 0 0', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{w.role}</p></div>
            </div>
            <span style={{display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.color}30`, fontSize:11, fontWeight:700, width:'fit-content'}}>{cfg.icon} {w.work_status}</span>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {(w.services.slice(0,3).length? w.services.slice(0,3): ['Pemeriksaan umum']).map(s=> <span key={s} style={{padding:'3px 7px', borderRadius:999, background:'#f0faf7', border:'1px solid var(--line)', fontSize:11, color:'var(--teal-dark)'}}>{s}</span>)}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)'}}><Clock size={11}/> {w.schedule}</div>
            <div style={{display:'flex', gap:8}}>
              <Link to={`/tim-kesehatan/${w.health_worker_id || w.id}`} className="btn btn-ghost" style={{flex:1, minHeight:38, fontSize:12, borderColor:'#e3eeeb'}}>Lihat profil</Link>
              <button className="btn btn-ghost" style={{flex:1, minHeight:38, fontSize:12, borderColor:'var(--teal)', color:'var(--teal)', fontWeight:700}} onClick={()=>setSelected(w)}>Hubungi</button>
            </div>
          </div>
        })}
      </div>}
    </section>

    {/* KONTAK DARURAT */}
    <section className="staff-panel" style={{marginTop:28, background:'#fff7ed', borderColor:'#fed7aa'}}>
      <h2 style={{display:'flex', alignItems:'center', gap:8, color:'#9a3412'}}>🚨 Butuh pertolongan?</h2>
      <p className="muted-text" style={{margin:'6px 0 0'}}>Jika Anda membutuhkan bantuan kesehatan segera, hubungi petugas yang tersedia. Untuk kondisi mengancam nyawa, segera hubungi layanan darurat/IGD setempat.</p>
      <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap'}}>
        <a href="#siaga" onClick={e=>{e.preventDefault(); document.querySelector('.team-grid')?.scrollIntoView({behavior:'smooth'})}} className="btn btn-primary">Hubungi Petugas</a>
        {emergencyContacts[0] && <a href={`tel:${formatPhone(emergencyContacts[0].phone)}`} className="btn btn-ghost" style={{background:'white'}}>📞 {emergencyContacts[0].label}: {formatPhone(emergencyContacts[0].phone)}</a>}
      </div>
      <p style={{margin:'10px 0 0', fontSize:11, color:'#9a3412', lineHeight:1.5}}><ShieldCheck size={12} style={{verticalAlign:'middle'}}/> Website ini tidak menggantikan layanan medis darurat. Selalu hubungi IGD/puskesmas terdekat untuk keadaan gawat darurat.</p>
    </section>

    {/* MODAL HUBUNGI */}
    {selected && (
      <>
        <div className="sheet-backdrop" onClick={()=>setSelected(null)} style={{zIndex:60}}/>
        <div role="dialog" aria-modal="true" aria-labelledby="hubungi-title" style={{position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)', zIndex:61, width:'min(420px, calc(100% - 24px))', background:'white', borderRadius:20, padding:20, boxShadow:'0 20px 60px rgba(0,0,0,.2)', maxHeight:'90vh', overflowY:'auto'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <h3 id="hubungi-title" style={{margin:0}}>Hubungi {selected.name}</h3>
            <button onClick={()=>setSelected(null)} aria-label="Tutup" style={{width:36,height:36, borderRadius:10, border:'1px solid var(--line)', background:'white', display:'grid', placeItems:'center'}}>✕</button>
          </div>
          <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:14}}>
            {selected.avatar_url ? <img src={selected.avatar_url} alt={selected.name} style={{width:48,height:48,borderRadius:'50%',objectFit:'cover'}}/> : <div className="avatar" style={{width:48,height:48}}>{selected.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>}
            <div><strong>{selected.name}</strong><div style={{fontSize:12, color:'var(--muted)'}}>{selected.role}</div><div style={{marginTop:4}}><span style={{padding:'3px 8px', borderRadius:999, background: statusConfig[selected.work_status]?.bg, color: statusConfig[selected.work_status]?.color, fontSize:11, fontWeight:700}}>{statusConfig[selected.work_status]?.icon} {selected.work_status}</span></div></div>
          </div>
          {selected.services.length>0 && <div style={{marginBottom:12}}><small style={{color:'var(--muted)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em'}}>Layanan</small><div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:6}}>{selected.services.map(s=> <span key={s} style={{padding:'4px 8px', borderRadius:999, background:'#f0faf7', border:'1px solid var(--line)', fontSize:11}}>{s}</span>)}</div></div>}
          <div style={{marginBottom:12}}><small style={{color:'var(--muted)', fontSize:11, fontWeight:700}}>Jadwal</small><div style={{fontSize:13, marginTop:4, display:'flex', alignItems:'center', gap:6}}><Clock size={14}/> {selected.schedule}</div></div>
          <div style={{padding:14, background:'#f9fafb', borderRadius:12, border:'1px solid var(--line)'}}>
            <small style={{color:'var(--muted)', fontSize:11, fontWeight:700}}>Nomor kontak</small>
            {selected.phone ? <div style={{fontSize:15, fontWeight:800, marginTop:6, letterSpacing:'.5px'}}>{formatPhone(selected.phone)}</div> : <div className="muted-text" style={{marginTop:6}}>Nomor kontak belum tersedia.</div>}
            <div style={{display:'grid', gap:8, marginTop:12}}>
              {selected.phone ? <a href={`tel:${formatPhone(selected.phone)}`} className="btn btn-primary" style={{width:'100%'}}><Phone size={16}/> Telepon</a> : null}
              {waUrl(selected.whatsapp) ? <a href={waUrl(selected.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{width:'100%', background:'white', borderColor:'#25D366', color:'#128C7E'}}><MessageCircle size={16}/> WhatsApp</a> : null}
              {!selected.phone && <p className="muted-text" style={{fontSize:12, margin:0}}>Tombol tidak tampil karena nomor belum tersedia.</p>}
            </div>
          </div>
          <button className="btn btn-ghost" style={{width:'100%', marginTop:12}} onClick={()=>setSelected(null)}>Tutup</button>
        </div>
      </>
    )}
  </div></main>
}
