import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getPublicArticleBySlug } from '../features/health/healthService'

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

  return (
    <main className="dashboard-page"><div className="container narrow-container">
      <Link className="back-link" to="/informasi-kesehatan"><ArrowLeft size={15} /> Semua artikel</Link>
      {error && <div className="staff-alert" role="alert">{error}<button className="btn btn-ghost" onClick={() => window.location.reload()}><RefreshCw size={15} /> Muat ulang</button></div>}
      {loading && <p className="muted-text">Memuat artikel...</p>}
      {!loading && !error && article && (
        <article>
          <small className="eyebrow">{article.category || 'Umum'}</small>
          <h1 className="display" style={{ fontSize: 'clamp(28px, 5vw, 40px)', margin: '8px 0 6px' }}>{article.title}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Diperbarui {new Date(article.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {article.thumbnail_url && <img src={article.thumbnail_url} alt={article.title} style={{ width: '100%', borderRadius: 16, margin: '12px 0' }} loading="lazy" />}
          <div style={{ background: '#f0faf7', border: '1px solid var(--line)', borderRadius: 14, padding: 14, margin: '14px 0', fontSize: 14.5, lineHeight: 1.6 }}>
            <strong>Ringkasan:</strong> {article.summary}
          </div>

          <div style={{ fontSize: 15.5, lineHeight: 1.75 }}>
            {(article.content || '').split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index} style={{ marginTop: 0, marginBottom: 14, whiteSpace: 'pre-line' }}>{paragraph}</p>
            ))}
          </div>

          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: 14, fontSize: 13.5, lineHeight: 1.6 }}>
            <strong>ℹ️ Catatan penting:</strong> Informasi pada artikel ini bersifat edukatif dan bukan diagnosis.
            Untuk kondisi pribadi atau keluhan yang berlanjut, silakan berkonsultasi dengan tenaga kesehatan,
            atau gunakan menu <Link to="/warga/bantuan" style={{ color: '#b42318', fontWeight: 700 }}>Bantuan Darurat</Link> bila mendesak.
          </div>

          {(data?.related ?? []).length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: '1.05rem' }}>Artikel terkait</h2>
              <div className="record-table">
                {data.related.map((item) => (
                  <Link key={item.slug} to={`/artikel/${item.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="record-row">
                      <div><strong>{item.title}</strong><small>{item.summary}</small></div>
                      <ChevronRight size={16} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      )}
    </div></main>
  )
}
