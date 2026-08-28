import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getPublicArticles } from '../features/health/healthService'
import { useAuth } from '../features/auth/AuthProvider'

const CATEGORIES = ['Semua', 'Tekanan Darah', 'Gula Darah', 'Pola Makan', 'Aktivitas Fisik', 'Kesehatan Lansia', 'Kesehatan Anak', 'Pertolongan Pertama', 'Pencegahan Penyakit', 'Pemeriksaan Rutin', 'Kesehatan Keluarga']

export function ArticlesPage() {
  const { access } = useAuth()
  const homePath = access?.role === 'warga' ? '/warga' : access?.role === 'nakes' ? '/nakes' : access?.role === 'admin' ? '/admin' : '/'
  const [category, setCategory] = useState('Semua')
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getPublicArticles(category === 'Semua' ? '' : category)
      .then((rows) => { if (active) setArticles(rows ?? []) })
      .catch((err) => { if (active) setError(err.message || 'Artikel belum dapat dimuat.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [category])

  return (
    <main className="dashboard-page"><div className="container narrow-container">
      <Link className="back-link" to={homePath}><ArrowLeft size={15} /> Beranda</Link>
      <div className="form-heading">
        <div className="icon-tile"><BookIcon /></div>
        <div><div className="eyebrow">Informasi kesehatan</div><h1 className="display">Artikel Kesehatan</h1></div>
      </div>
      <p className="page-intro">Informasi edukatif untuk mendampingi pemeriksaan rutin Anda — bukan pengganti konsultasi dengan tenaga kesehatan.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {CATEGORIES.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)}
            style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--line)', background: category === item ? 'var(--teal)' : '#fff', color: category === item ? '#fff' : 'var(--ink)', cursor: 'pointer' }}>
            {item}
          </button>
        ))}
      </div>

      {error && <div className="staff-alert" role="alert">{error}<button className="btn btn-ghost" onClick={() => setCategory((c) => c)}><RefreshCw size={15} /> Coba lagi</button></div>}
      {loading ? <p className="muted-text">Memuat artikel...</p> : articles.length === 0 ? (
        <p className="muted-text">Belum ada artikel pada kategori ini.</p>
      ) : (
        <div className="article-grid">
          {articles.map((article) => (
            <Link key={article.article_id} to={`/artikel/${article.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <article className="article-card">
                <small>{article.category || 'Umum'}</small>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Baca artikel <ChevronRight size={14} /></span>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div></main>
  )
}

function BookIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
}

export { CATEGORIES as ARTICLE_CATEGORIES }
