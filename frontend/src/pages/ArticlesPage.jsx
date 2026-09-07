import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Clock3, Search, RefreshCw, HeartPulse, Leaf, Activity, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getPublicArticles } from '../features/health/healthService'
import { useAuth } from '../features/auth/AuthProvider'
import { setSeo } from '../utils/seo'

const CATEGORIES = ['Semua', 'Tekanan Darah', 'Gula Darah', 'Pola Makan', 'Aktivitas Fisik', 'Kesehatan Lansia', 'Kesehatan Anak', 'Pertolongan Pertama', 'Pencegahan Penyakit', 'Pemeriksaan Rutin', 'Kesehatan Keluarga']

const HERO_IMAGE_800 = '/images/informasi-sehat-untuk-anda-dan-keluarga-800.webp'
const HERO_IMAGE_1200 = '/images/informasi-sehat-untuk-anda-dan-keluarga-800.webp'

// kategori -> file (800 variant untuk card, full untuk hero/detail)
const CATEGORY_IMAGE = {
  'Tekanan Darah': 'memahami-tekanan-darah-800.webp',
  'Gula Darah': 'mengenal-gula-darah-800.webp',
  'Pola Makan': 'pola-makan-800.webp',
  'Aktivitas Fisik': 'aktivitas-fisik-ringan-untuk-semua-800.webp',
  'Kesehatan Lansia': 'menjaga-kesehatan-lansia-800.webp',
  'Kesehatan Anak': 'imunisasi-dan-kesehatan-anak-800.webp',
  'Pertolongan Pertama': 'pertolongan-pertama-luka-ringan-800.webp',
  'Pencegahan Penyakit': 'cuci-tangan-pencegahan-paling-mudah-800.webp',
  'Pemeriksaan Rutin': 'kapan-harus-menghubungi-petugas-800.webp',
  'Kesehatan Keluarga': 'satu-keluarga-sehat-satu-desa-kuat-800.webp',
}

const TITLE_KEYWORDS = [
  { kw: ['tekanan darah', 'hipertensi', 'tensi'], file: 'cara-menjaga-tekanan-darah-tetap-sehat-800.webp' },
  { kw: ['gula darah', 'diabetes'], file: 'mengenal-gula-darah-800.webp' },
  { kw: ['pola makan', 'gizi', 'makan'], file: 'pola-makan-800.webp' },
  { kw: ['aktivitas', 'fisik', 'olahraga', 'senam'], file: 'aktivitas-fisik-ringan-untuk-semua-800.webp' },
  { kw: ['lansia', 'lanjut usia'], file: 'menjaga-kesehatan-lansia-800.webp' },
  { kw: ['anak', 'imunisasi', 'balita'], file: 'imunisasi-dan-kesehatan-anak-800.webp' },
  { kw: ['posyandu'], file: 'rutin-ke-posyandu-kenapa-penting-800.webp' },
  { kw: ['luka', 'pertolongan pertama', 'p3k'], file: 'pertolongan-pertama-luka-ringan-800.webp' },
  { kw: ['cuci tangan', 'pencegahan', 'paling mudah'], file: 'cuci-tangan-pencegahan-paling-mudah-800.webp' },
  { kw: ['petugas', 'menghubungi', 'kapan harus'], file: 'kapan-harus-menghubungi-petugas-800.webp' },
  { kw: ['keluarga', 'desa kuat'], file: 'satu-keluarga-sehat-satu-desa-kuat-800.webp' },
]

function getArticleImage(article, index = 0) {
  if (article?.thumbnail_url) return article.thumbnail_url
  const title = (article?.title || '').toLowerCase()
  const cat = article?.category || ''
  // 1. keyword match dari judul
  for (const entry of TITLE_KEYWORDS) {
    if (entry.kw.some(k => title.includes(k))) return `/images/${entry.file}`
  }
  // 2. mapping kategori
  if (CATEGORY_IMAGE[cat]) return `/images/${CATEGORY_IMAGE[cat]}`
  // 3. fallback berurutan biar variasi
  const fallbacks = Object.values(CATEGORY_IMAGE)
  return `/images/${fallbacks[index % fallbacks.length]}`
}

function estimateReadMinutes(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.ceil(words / 180))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '' }
}

export function ArticlesPage() {
  const { access } = useAuth()
  const homePath = access?.role === 'warga' ? '/warga' : access?.role === 'nakes' ? '/nakes' : access?.role === 'admin' ? '/admin' : '/'
  const [category, setCategory] = useState('Semua')
  const [search, setSearch] = useState('')
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getPublicArticles(category === 'Semua' ? '' : category)
      .then((rows) => { if (active) setArticles(rows ?? []) })
      .catch((err) => { if (active) setError(err.message || 'Informasi belum dapat dimuat.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [category])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return articles
    return articles.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.summary || '').toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q)
    )
  }, [articles, search])

  const featured = filtered[0] || null
  const gridArticles = filtered.slice(1)

  useEffect(() => {
    setSeo({
      title: 'Informasi Kesehatan — Desa Sehat Kenanga',
      description: 'Temukan informasi sederhana seputar kesehatan, pemeriksaan rutin, pola hidup sehat, dan tips menjaga kesehatan keluarga di Desa Sehat Kenanga.',
      canonical: 'https://dika-web.web.id/informasi-kesehatan',
      image: 'https://dika-web.web.id/images/informasi-sehat-untuk-anda-dan-keluarga-800.webp',
      type: 'website'
    })
  }, [])

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = HERO_IMAGE_800
    link.setAttribute('imagesrcset', `${HERO_IMAGE_800} 800w`)
    link.setAttribute('imagesizes', '(max-width: 900px) 100vw, 460px')
    link.setAttribute('fetchpriority', 'high')
    document.head.appendChild(link)
    return () => { try { document.head.removeChild(link) } catch {} }
  }, [])

  return (
    <main id="main-content" className="article-page">
      <div className="article-hero">
        <div className="container article-hero-inner">
          <div className="article-hero-copy">
            <Link className="back-link article-back" to={homePath}><ArrowLeft size={15} /> Beranda</Link>
            <div className="article-eyebrow"><Sparkles size={12} /> INFORMASI KESEHATAN</div>
            <h1 className="display article-hero-title">Informasi Sehat untuk Anda dan Keluarga</h1>
            <p className="article-hero-desc">Temukan informasi sederhana seputar kesehatan, pemeriksaan rutin, pola hidup sehat, dan tips menjaga kesehatan keluarga.</p>
            <div className="article-hero-pills">
              <span className="article-mini-pill"><HeartPulse size={14} /> Terpercaya</span>
              <span className="article-mini-pill"><Leaf size={14} /> Mudah dipahami</span>
              <span className="article-mini-pill"><Activity size={14} /> Untuk semua usia</span>
            </div>
          </div>
          <div className="article-hero-visual">
            <div className="article-hero-image-wrap">
              <img
                src={HERO_IMAGE_800}
                srcSet={`${HERO_IMAGE_800} 800w`}
                sizes="(max-width: 900px) 100vw, 460px"
                alt="Keluarga sehat bersama tenaga kesehatan desa Kenanga"
                width={760}
                height={520}
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
              <span className="article-float article-float--a"><HeartPulse size={15} /> Pemeriksaan rutin</span>
              <span className="article-float article-float--b"><Leaf size={14} /> Hidup sehat</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container article-main">
        {featured && !loading && !error && (
          <section className="article-featured" aria-label="Artikel Pilihan">
            <div className="article-section-label">Artikel Pilihan</div>
            <Link to={`/artikel/${featured.slug}`} className="article-featured-card">
              <div className="article-featured-image">
                <img
                  src={getArticleImage(featured, 0)}
                  alt={featured.title}
                  width={600}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  onError={(e)=>{e.currentTarget.src='/images/satu-keluarga-sehat-satu-desa-kuat-800.webp'}}
                />
                <span className="article-badge">{featured.category || 'Tips Kesehatan'}</span>
              </div>
              <div className="article-featured-content">
                <span className="article-badge article-badge--inline">{featured.category || 'Tips Kesehatan'}</span>
                <h2>{featured.title || '5 Kebiasaan Sederhana untuk Menjaga Kesehatan Setiap Hari'}</h2>
                <p>{featured.summary || 'Langkah sederhana yang dapat dilakukan di rumah untuk menjaga tubuh tetap sehat dan bugar.'}</p>
                <div className="article-meta">
                  <span><Clock3 size={13} /> {formatDate(featured.updated_at || featured.created_at) || '6 September 2026'} • {estimateReadMinutes((featured.summary || '') + ' ' + (featured.content || ''))} menit baca</span>
                </div>
                <span className="article-cta">Baca selengkapnya <ArrowUpRight size={14} /></span>
              </div>
            </Link>
          </section>
        )}

        <div className="article-toolbar">
          <div className="article-search" role="search">
            <Search size={16} className="article-search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari informasi kesehatan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cari informasi kesehatan"
              autoComplete="off"
            />
            {search && <button type="button" className="article-search-clear" onClick={() => setSearch('')} aria-label="Hapus pencarian">×</button>}
          </div>
        </div>

        <div className="article-categories" role="tablist" aria-label="Kategori artikel">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              onClick={() => setCategory(item)}
              className={`article-pill ${category === item ? 'article-pill--active' : ''}`}
            >
              {item}
            </button>
          ))}
        </div>

        {error && (
          <div className="article-state article-state--error" role="alert">
            <div className="article-state-icon">!</div>
            <h3>Informasi belum dapat dimuat</h3>
            <p>Silakan coba lagi beberapa saat.</p>
            <button className="btn btn-primary" onClick={() => setCategory((c) => c)}><RefreshCw size={15} /> Coba lagi</button>
          </div>
        )}

        {loading ? (
          <div className="article-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="article-card article-card--skeleton" aria-hidden="true">
                <div className="skeleton skeleton-image" />
                <div className="skeleton skeleton-badge" />
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-text" />
                <div className="skeleton skeleton-meta" />
              </div>
            ))}
          </div>
        ) : !error && filtered.length === 0 ? (
          <div className="article-state">
            <div className="article-state-icon" style={{ background: 'var(--mint)', color: 'var(--teal)' }}><Search size={22} /></div>
            <h3>{search ? 'Tidak ada hasil' : 'Belum ada artikel'}</h3>
            <p>{search ? `Tidak menemukan artikel untuk "${search}". Coba kata kunci lain atau pilih kategori berbeda.` : 'Informasi kesehatan baru akan hadir di sini.'}</p>
            {search && <button className="btn btn-ghost" onClick={() => setSearch('')}>Hapus pencarian</button>}
          </div>
        ) : !error && (
          <>
            <div className="article-section-head">
              <h2>Artikel Terbaru</h2>
              <span className="article-count">{filtered.length} artikel</span>
            </div>
            <div className="article-grid">
              {(gridArticles.length ? gridArticles : filtered).map((article, idx) => (
                <Link key={article.article_id || article.slug} to={`/artikel/${article.slug}`} className="article-card-link" aria-label={`Baca artikel ${article.title}`}>
                  <article className="article-card">
                    <div className="article-card-image">
                      <img
                        src={getArticleImage(article, idx + 1)}
                        alt={article.title}
                        width={400}
                        height={225}
                        loading="lazy"
                        decoding="async"
                        onError={(e)=>{e.currentTarget.src='/images/satu-keluarga-sehat-satu-desa-kuat-800.webp'}}
                      />
                      <span className="article-badge article-badge--on-image">{article.category || 'Umum'}</span>
                    </div>
                    <div className="article-card-body">
                      <h3>{article.title}</h3>
                      <p>{article.summary}</p>
                      <div className="article-card-meta">
                        <span>{formatDate(article.updated_at || article.created_at)}</span>
                        <span>• {estimateReadMinutes((article.summary || '') + ' ' + (article.content || ''))} menit baca</span>
                      </div>
                      <span className="article-card-cta">Baca artikel <ArrowUpRight size={14} /></span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export { CATEGORIES as ARTICLE_CATEGORIES }
