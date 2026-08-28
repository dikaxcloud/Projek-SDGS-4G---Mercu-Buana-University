import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, HeartHandshake, ShieldCheck, Siren, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoArticles, demoStats, demoWorkers } from '../services/demoData'
import { isSupabaseConfigured } from '../lib/supabase'
import { getPublicLandingData } from '../features/health/healthService'
import { supabase } from '../lib/supabase'

const fallbackStats = [
  { value: '—', label: 'RT terlayani' },
  { value: '—', label: 'Kepala keluarga' },
  { value: '—', label: 'Warga terdata' },
  { value: '—', label: 'Tenaga kesehatan' },
]

export function LandingPage() {
  const [stats, setStats] = useState(isSupabaseConfigured ? fallbackStats : demoStats)
  const [workers, setWorkers] = useState(isSupabaseConfigured ? [] : demoWorkers)
  const [articles, setArticles] = useState(isSupabaseConfigured ? [] : demoArticles)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const load = () => getPublicLandingData()
      .then((data) => {
        if (!data) return
        if (Array.isArray(data.stats) && data.stats.length) setStats(data.stats)
        setWorkers((data.workers ?? []).map((w) => ({ name: w.name, role: w.role, specialty: w.specialty, initials: (w.name || '?').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(), online: Boolean(w.is_online) })))
        setArticles((data.articles ?? []).map((a) => ({ category: 'Informasi kesehatan', title: a.title, text: a.summary, slug: a.slug })))
      })
      .catch(() => {})
    void load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])

  return <>
    <main>
      <section className="hero"><div className="container hero-grid">
        <div>
          <div className="eyebrow">Portal kesehatan warga desa</div>
          <h1 className="display">Kesehatan warga, <span style={{ color: 'var(--teal)' }}>lebih dekat.</span></h1>
          <p className="hero-copy">Pantau kesehatan keluarga, simpan riwayat pemeriksaan, dan hubungi petugas desa dengan lebih mudah dari HP.</p>
          <div className="hero-actions"><Link className="btn btn-primary" to="/login">Masuk sebagai warga <ArrowRight size={17} /></Link><a className="btn btn-ghost" href="#layanan">Lihat layanan</a></div>
          <div className="hero-note"><ShieldCheck size={16} color="var(--teal)" /><span>Data yang tampil adalah <strong>data demo</strong> untuk prototipe.</span></div>
        </div>
        <div className="hero-visual" aria-label="Pratinjau dashboard kesehatan warga"><div className="blob" /><div className="phone-card">
          <div className="phone-top"><span>Rabu, 23 Agustus 2026</span><span className="avatar">B</span></div>
          <p style={{ margin: '18px 0 0', fontSize: 13, color: 'var(--muted)' }}>Selamat pagi,</p><h3 style={{ margin: '4px 0 0', fontSize: 22 }}>Budi 👋</h3>
          <div className="health-card"><p>Status kesehatan terakhir</p><strong>Baik dan terpantau</strong><span style={{ display: 'block', marginTop: 9, fontSize: 12, opacity: .85 }}>Pemeriksaan terakhir hari ini</span></div>
          <div className="mini-grid"><div className="mini-stat"><small>Tekanan darah</small><strong>120/80</strong></div><div className="mini-stat"><small>Gula darah</small><strong>105 mg/dL</strong></div></div>
        </div><div className="float-chip"><Check size={16} /> Data tersimpan rapi</div><div className="float-chip bottom"><HeartHandshake size={16} /> Petugas siap membantu</div></div>
      </div></section>

      <section className="section" id="tentang"><div className="container"><div className="section-head"><div><div className="eyebrow">Tentang desa</div><h2 className="display">Satu tempat untuk kesehatan keluarga.</h2></div><p className="section-intro">Tidak perlu bingung mencari catatan kesehatan. Semua riwayat pemeriksaan keluarga dapat dilihat dari satu tempat.</p></div><div className="stats-grid">{stats.map((stat) => <div className="stat-card" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div></div></section>

      <section className="section" id="layanan"><div className="container"><div className="eyebrow">Layanan utama</div><h2 className="display">Yang bisa dilakukan warga.</h2><p className="section-intro">Dibuat ringkas supaya mudah dipahami dan digunakan, bahkan saat pertama kali membuka aplikasi.</p><div className="feature-grid" style={{ marginTop: 24 }}><Feature Icon={HeartHandshake} title="Pantau kesehatan" text="Lihat tekanan darah, gula darah, berat badan, dan riwayat pemeriksaan." /><Feature Icon={BookOpen} title="Baca informasi" text="Pelajari kebiasaan sehat dengan bahasa sederhana dan edukatif." /><Feature Icon={Siren} title="Bantuan darurat" text="Temukan kontak petugas dan instruksi awal saat membutuhkan bantuan." /></div></div></section>

      <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">Cara menggunakan</div><h2 className="display">Mulai dalam beberapa langkah.</h2></div></div><div className="step-list"><Step number="1" title="Daftar dengan identitas" text="Isi data identitas warga. Satu NIK hanya untuk satu profil warga." /><Step number="2" title="Hubungkan akun Google" text="Google dipakai untuk masuk, bukan sebagai identitas utama warga." /><Step number="3" title="Pantau kesehatan" text="Lihat riwayat dan hubungi petugas kapan pun dari HP." /></div></div></section>

      <section className="section" id="nakes"><div className="container"><div className="section-head"><div><div className="eyebrow">Tim kesehatan desa</div><h2 className="display">Ada yang siap membantu.</h2></div><Link to="/tim-kesehatan" className="btn btn-soft">Lihat semua <ChevronRight size={16} /></Link></div>{workers.length === 0 ? <p className="muted-text">Belum ada data tenaga kesehatan.</p> : <div className="team-grid">{workers.map((worker) => <div className="team-card" key={worker.name}><div className="avatar">{worker.initials}</div><div><h3>{worker.name}</h3><p>{worker.role} · {worker.specialty}</p><span className="online" style={{ color: worker.online ? '#15803d' : 'var(--muted)' }}>{worker.online ? 'Sedang online' : 'Tidak sedang online'}</span></div></div>)}</div>}</div></section>

      <section className="section" id="informasi"><div className="container"><div className="section-head"><div><div className="eyebrow">Informasi kesehatan</div><h2 className="display">Baca sedikit, lakukan setiap hari.</h2></div><Link to="/informasi-kesehatan" className="btn btn-soft">Lihat semua artikel <ChevronRight size={16} /></Link></div>{articles.length === 0 ? <p className="muted-text">Belum ada artikel kesehatan.</p> : <div className="article-grid">{articles.map((article) => <Link key={article.slug || article.title} to={`/artikel/${article.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}><article className="article-card"><small>{article.category}</small><h3>{article.title}</h3><p>{article.text}</p><span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 13 }}>Baca selengkapnya →</span></article></Link>)}</div>}</div></section>

      <div className="container"><section className="cta"><div><h2 className="display">Kesehatan lebih mudah dimulai hari ini.</h2><p>Gunakan demo warga untuk mencoba alurnya.</p></div><Link to="/login" className="btn" style={{ background: 'white', color: 'var(--teal-dark)' }}>Mulai sekarang <ArrowRight size={17} /></Link></section></div>
    </main>
  </>
}

function Feature({ Icon, title, text }) { return <div className="feature-card"><div className="icon-tile"><Icon size={21} /></div><h3>{title}</h3><p>{text}</p></div> }
function Step({ number, title, text }) { return <div className="step"><div className="step-number">{number}</div><h3>{title}</h3><p>{text}</p></div> }
