import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Clock3, RefreshCw, Lightbulb, HeartPulse } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getPublicArticleBySlug } from '../features/health/healthService'
import { setSeo } from '../utils/seo'
import { getArticleImageByFields, toSrcSet } from '../utils/articleImages'

function getDetailImage(article) {
  return getArticleImageByFields(article ?? {})
}
function getDetailThumb(item) {
  return getArticleImageByFields(item ?? {})
}
function thumbSrcSet(p800) {
  return toSrcSet(p800)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return '' }
}
function estimateReadMinutes(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.ceil(words / 180))
}

export function ArticleDetailPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getPublicArticleBySlug(slug)
      .then((res) => { if (active) setData(res) })
      .catch((err) => { if (active) setError(err.message || 'Artikel tidak ditemukan.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug])

  const article = data?.article

  useEffect(() => {
    if (!article) return
    const desc = (article.summary || '').slice(0, 155)
    const img = getDetailImage(article)
    const canonical = `https://dika-web.web.id/artikel/${slug}`
    setSeo({
      title: `${article.title} — Desa Sehat Kenanga`,
      description: desc || 'Artikel kesehatan Desa Sehat Kenanga',
      canonical,
      image: img.startsWith('http') ? img : `https://dika-web.web.id${img}`,
      type: 'article'
    })
    // Article JSON-LD
    const prev = document.querySelector('#ld-article')
    if (prev) prev.remove()
    const ld = document.createElement('script')
    ld.id = 'ld-article'
    ld.type = 'application/ld+json'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: desc,
      image: img.startsWith('http') ? img : `https://dika-web.web.id${img}`,
      author: { '@type': 'Organization', name: 'Desa Sehat Kenanga' },
      publisher: { '@type': 'Organization', name: 'Desa Sehat Kenanga', logo: { '@type': 'ImageObject', url: 'https://dika-web.web.id/logo-512.webp' } },
      datePublished: article.created_at,
      dateModified: article.updated_at,
      mainEntityOfPage: canonical
    })
    document.head.appendChild(ld)
    return () => { const n = document.querySelector('#ld-article'); if (n) n.remove() }
  }, [article, slug])

  if (error) {
    return (
      <main className="article-detail-page"><div className="container narrow-container" style={{ paddingTop: 18 }}>
        <Link className="back-link" to="/informasi-kesehatan"><ArrowLeft size={15} /> Semua artikel</Link>
        <div className="article-state article-state--error" style={{ marginTop: 24 }} role="alert">
          <div className="article-state-icon">!</div>
          <h3>Informasi belum dapat dimuat</h3>
          <p>Silakan coba lagi beberapa saat.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}><RefreshCw size={15} /> Coba lagi</button>
        </div>
      </div></main>
    )
  }

  if (loading) {
    return (
      <main className="article-detail-page"><div className="container narrow-container" style={{ paddingTop: 18 }}>
        <Link className="back-link" to="/informasi-kesehatan"><ArrowLeft size={15} /> Semua artikel</Link>
        <div className="detail-skeleton" aria-hidden="true">
          <div className="skeleton skeleton-badge" style={{ marginTop: 20 }} />
          <div className="skeleton" style={{ height: 36, width: '85%', marginTop: 14, borderRadius: 10 }} />
          <div className="skeleton" style={{ height: 36, width: '60%', marginTop: 10, borderRadius: 10 }} />
          <div className="skeleton" style={{ height: 14, width: 220, marginTop: 16, borderRadius: 999 }} />
          <div className="skeleton skeleton-image" style={{ height: 340, marginTop: 18, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 14, width: '100%', marginTop: 18 }} />
          <div className="skeleton" style={{ height: 14, width: '96%', marginTop: 10 }} />
          <div className="skeleton" style={{ height: 14, width: '92%', marginTop: 10 }} />
        </div>
      </div></main>
    )
  }

  if (!article) {
    return (
      <main className="article-detail-page"><div className="container narrow-container" style={{ paddingTop: 18 }}>
        <Link className="back-link" to="/informasi-kesehatan"><ArrowLeft size={15} /> Semua artikel</Link>
        <div className="article-state" style={{ marginTop: 24 }}>
          <h3>Artikel tidak ditemukan</h3>
          <p>Artikel mungkin telah dipindahkan atau belum tersedia.</p>
          <Link to="/informasi-kesehatan" className="btn btn-primary">Lihat artikel lain</Link>
        </div>
      </div></main>
    )
  }

  const paragraphs = (article.content || '').split(/\n\s*\n/).filter(Boolean)
  const readingMinutes = estimateReadMinutes((article.content || '') + ' ' + (article.summary || ''))
  const heroSrc = getDetailImage(article)
  const heroSrcSet = toSrcSet(heroSrc) || `${heroSrc} 800w`

  return (
    <main id="main-content" className="article-detail-page">
      <div className="container detail-layout">
        <div className="detail-main">
          <Link className="back-link" to="/informasi-kesehatan"><ArrowLeft size={15} /> Semua artikel</Link>

          <div className="detail-eyebrow">{article.category || 'Umum'}</div>
          <h1 className="detail-title display">{article.title}</h1>
          <div className="detail-meta">
            <span>{formatDate(article.updated_at)} </span>
            <span className="dot">•</span>
            <span><Clock3 size={12} aria-hidden="true" /> {readingMinutes} menit baca</span>
            <span className="dot">•</span>
            <span>Desa Sehat Kenanga</span>
          </div>

          <div className="detail-hero-image">
            <img
              src={heroSrc}
              srcSet={heroSrcSet}
              sizes="(max-width: 900px) 100vw, 760px"
              alt={article.title}
              width={1100}
              height={620}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              style={{ width:'100%', height:'auto', aspectRatio:'1100 / 620' }}
              onError={(e) => {
                const fallback = '/images/satu-keluarga-sehat-satu-desa-kuat-800.webp'
                if (e.currentTarget.src !== window.location.origin + fallback) {
                  e.currentTarget.src = fallback
                  e.currentTarget.srcSet = `${fallback.replace('-800.webp','-400.webp')} 400w, ${fallback} 800w`
                } else {
                  e.currentTarget.style.display = 'none'
                  const ph = e.currentTarget.nextElementSibling
                  if (ph) ph.style.display = 'grid'
                }
              }}
            />
            <div className="detail-image-fallback" style={{ display: 'none' }} aria-hidden="true">
              <span>Image unavailable</span>
              <small>{article.title}</small>
            </div>
          </div>

          <div className="detail-content">
            <div className="detail-summary">
              <strong>Ringkasan:</strong> {article.summary}
            </div>

            <div className="detail-body">
              {paragraphs.map((paragraph, index) => {
                const isHeading = paragraph.length < 90 && !paragraph.includes('.') && index !== 0 && paragraphs[index + 1]?.length > 80
                if (isHeading) return <h2 key={index}>{paragraph}</h2>
                if (paragraph.includes('\n- ') || paragraph.includes('\n•')) {
                  const lines = paragraph.split('\n').filter(Boolean)
                  const title = lines[0]?.length < 90 ? lines[0] : null
                  const items = title ? lines.slice(1) : lines
                  return (
                    <div key={index}>
                      {title && <h2>{title}</h2>}
                      <ul>
                        {items.map((li, liIdx) => <li key={liIdx}>{li.replace(/^[-•]\s*/, '')}</li>)}
                      </ul>
                    </div>
                  )
                }
                return <p key={index}>{paragraph}</p>
              })}
            </div>

            <div className="detail-highlight" role="note">
              <div className="detail-highlight-icon"><Lightbulb size={16} aria-hidden="true" /></div>
              <div>
                <strong>💡 Tips:</strong> Lakukan pemeriksaan kesehatan secara rutin agar perubahan kondisi tubuh dapat diketahui lebih awal. Jika ada keluhan yang berlanjut, konsultasikan dengan tenaga kesehatan.
              </div>
            </div>

            <div className="detail-note">
              <strong>ℹ️ Catatan penting:</strong> Informasi pada artikel ini bersifat edukatif dan bukan diagnosis. Untuk kondisi pribadi atau keluhan yang berlanjut, silakan berkonsultasi dengan tenaga kesehatan, atau gunakan menu <Link to="/warga/bantuan" style={{ color: 'var(--teal)', fontWeight: 800 }}>Bantuan Darurat</Link> bila mendesak.
            </div>

            <div className="detail-cta">
              <div>
                <h3>Peduli kesehatan dimulai dari mengenal kondisi diri sendiri.</h3>
                <p>Pantau hasil pemeriksaan kesehatan Anda melalui Desa Sehat Kenanga.</p>
              </div>
              <div className="detail-cta-actions">
                <Link to="/warga/kesehatan" className="btn btn-primary">Pantau Kesehatan <ArrowUpRight size={15} /></Link>
                <Link to="/informasi-kesehatan" className="btn btn-ghost">Kembali ke Artikel</Link>
              </div>
            </div>
          </div>

          {(data?.related ?? []).length > 0 && (
            <section className="detail-related-mobile" aria-label="Artikel terkait">
              <h2>Artikel terkait</h2>
              <div className="detail-related-grid">
                {data.related.map((item) => (
                  <Link key={item.slug} to={`/artikel/${item.slug}`} className="detail-related-card">
                    <img src={getDetailThumb(item)} srcSet={thumbSrcSet(getDetailThumb(item))} sizes="84px" alt={item.title} width={84} height={64} loading="lazy" decoding="async" onError={(e)=>{e.currentTarget.src='/images/satu-keluarga-sehat-satu-desa-kuat-800.webp'; e.currentTarget.srcSet=`/images/satu-keluarga-sehat-satu-desa-kuat-400.webp 400w, /images/satu-keluarga-sehat-satu-desa-kuat-800.webp 800w`}} style={{ aspectRatio:'84 / 64' }} />
                    <div>
                      <small>{item.category || 'Umum'}</small>
                      <strong>{item.title}</strong>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="detail-sidebar" aria-label="Artikel terkait">
          {(data?.related ?? []).length > 0 && (
            <>
              <h3>Artikel terkait</h3>
              <div className="detail-sidebar-list">
                {data.related.slice(0, 3).map((item) => (
                  <Link key={item.slug} to={`/artikel/${item.slug}`} className="detail-sidebar-item">
                    <img src={getDetailThumb(item)} srcSet={thumbSrcSet(getDetailThumb(item))} sizes="72px" alt={item.title} width={72} height={56} loading="lazy" decoding="async" onError={(e)=>{e.currentTarget.src='/images/satu-keluarga-sehat-satu-desa-kuat-800.webp'; e.currentTarget.srcSet=`/images/satu-keluarga-sehat-satu-desa-kuat-400.webp 400w, /images/satu-keluarga-sehat-satu-desa-kuat-800.webp 800w`}} style={{ aspectRatio:'72 / 56' }} />
                    <div>
                      <small>{item.category || 'Umum'}</small>
                      <strong>{item.title}</strong>
                      <span>Baca →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
          <div className="detail-sidebar-cta">
            <div className="detail-sidebar-cta-icon"><HeartPulse size={18} aria-hidden="true" /></div>
            <strong>Butuh bantuan?</strong>
            <p>Hubungi petugas desa jika ada keluhan mendesak.</p>
            <Link to="/warga/bantuan" className="btn btn-primary btn-wide">Bantuan Darurat</Link>
          </div>
        </aside>
      </div>
    </main>
  )
}
