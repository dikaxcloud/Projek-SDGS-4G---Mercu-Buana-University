import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, BookOpen, Loader2, MessageSquare, RefreshCw, Search, Send, Sparkles, TrendingUp } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { getRecentExaminations } from '../features/health/healthService'
import {
  analyzeHealthRecord,
  analyzeHealthTrend,
  chatHealthAssistant,
  buildHealthReminder,
  getPersonalEducation,
} from '../services/ai/aiService'

const METRICS = [
  { id: 'blood_pressure', label: 'Tekanan Darah' },
  { id: 'sugar', label: 'Gula Darah' },
  { id: 'weight', label: 'Berat Badan' },
]

const QUICK_QUESTIONS = [
  'Apa arti hasil tensi saya?',
  'Bagaimana tren kesehatan saya?',
  'Apa yang perlu saya perhatikan?',
  'Bagaimana cara menjaga kesehatan?',
]

export function CitizenAiPage() {
  const { access } = useAuth()
  const citizenId = access?.citizen_id || null
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [records, setRecords] = useState([])

  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const [metric, setMetric] = useState('blood_pressure')
  const [trend, setTrend] = useState(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const [education, setEducation] = useState(null)
  const [showEducation, setShowEducation] = useState(false)

  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([{ sender: 'ai', text: 'Halo 👋 Ada yang ingin kamu tanyakan tentang kesehatanmu?' }])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  const latestExaminedAt = records[0]?.examined_at ?? null
  const reminder = buildHealthReminder(latestExaminedAt)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => { void loadRecords() }, [citizenId])

  const loadRecords = async () => {
    try {
      const result = await getRecentExaminations(citizenId)
      setRecords(result ?? [])
    } catch {
      setRecords([])
    }
  }

  const runAnalysis = useCallback(async () => {
    if (!records.length) {
      setAnalysis({ empty: true })
      return
    }
    setAnalysisLoading(true)
    setAnalysisError('')
    try {
      const result = await analyzeHealthRecord(records[0], { recordId: records[0].health_record_id })
      setAnalysis(result)
    } catch {
      setAnalysisError('Analisis AI sedang tidak tersedia. Data pemeriksaan Anda tetap tersimpan.')
    } finally {
      setAnalysisLoading(false)
    }
  }, [records])

  const runTrend = useCallback(async (selectedMetric = metric) => {
    setTrendLoading(true)
    try {
      const result = await analyzeHealthTrend(records, selectedMetric)
      setTrend(result)
    } catch {
      setTrend({ summary: 'Analisis tren sementara tidak tersedia.', insufficient: true })
    } finally {
      setTrendLoading(false)
    }
  }, [records, metric])

  const loadEducation = useCallback(async () => {
    setShowEducation(true)
    if (education) return
    const result = await getPersonalEducation(records)
    setEducation(result)
  }, [records, education])

  const sendChat = async (text) => {
    const message = (text ?? chatInput).trim()
    if (!message || chatSending) return
    setChatInput('')
    setMessages((prev) => [...prev, { sender: 'user', text: message }])
    setChatSending(true)
    try {
      const res = await chatHealthAssistant(message)
      setMessages((prev) => [...prev, { sender: 'ai', text: res.reply }])
    } finally {
      setChatSending(false)
    }
  }

  const cardStyle = { border: '1px solid var(--line)', padding: '1.1rem', borderRadius: '0.9rem', background: '#fff' }
  const actionBtn = { width: '100%', marginTop: '0.75rem' }

  return (
    <div className="dashboard-page">
      <div className="container narrow-container">
        <Link className="back-link" to="/warga">← Kembali ke beranda</Link>
        <div className="form-heading">
          <div className="icon-tile"><Sparkles size={21} /></div>
          <div>
            <div className="eyebrow">Portal warga</div>
            <h1 className="display">✨ AI Kesehatan Saya</h1>
          </div>
        </div>

        {!online && (
          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 12, padding: '10px 12px', fontSize: 13, marginBottom: '1rem' }}>
            <AlertTriangle size={15} /> Anda sedang offline. Fitur AI membutuhkan koneksi internet. Data tersimpan tetap bisa dilihat.
          </div>
        )}

        {/* 🔔 Pengingat Kesehatan — simple, non-intrusive */}
        {reminder && (
          <div style={{ ...cardStyle, borderLeft: '4px solid var(--teal)', marginBottom: '1rem', display: 'flex', gap: 10 }}>
            <Bell size={18} color="var(--teal)" />
            <div>
              <strong style={{ fontSize: 14 }}>🔔 Pengingat Kesehatan</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{reminder.message}</p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* 🔍 Analisis Pemeriksaan */}
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>🔍 Analisis Pemeriksaan</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Jelaskan hasil pemeriksaan terbaru Anda dengan bahasa sederhana.</p>

            {analysisLoading ? (
              <p style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}><Loader2 size={14} className="spin" /> ✨ AI sedang membaca hasil pemeriksaan…</p>
            ) : analysis?.empty ? (
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>Belum ada pemeriksaan untuk dianalisis.</p>
            ) : analysis ? (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--mint)', color: 'var(--teal-dark)', borderRadius: 999, padding: '3px 10px' }}>{analysis.statusUi?.label}</span>
                <p style={{ margin: '10px 0 8px', fontSize: 14 }}>{analysis.summary}</p>
                {analysis.observations?.length > 0 && (
                  <>
                    <strong style={{ fontSize: 13 }}>Hal yang perlu diperhatikan:</strong>
                    <ul style={{ margin: '4px 0 8px', paddingLeft: 20, fontSize: 13 }}>{analysis.observations.map((item, i) => <li key={i}>{item}</li>)}</ul>
                  </>
                )}
                {analysis.recommendations?.length > 0 && (
                  <>
                    <strong style={{ fontSize: 13 }}>Saran umum:</strong>
                    <ul style={{ margin: '4px 0 8px', paddingLeft: 20, fontSize: 13 }}>{analysis.recommendations.map((item, i) => <li key={i}>{item}</li>)}</ul>
                  </>
                )}
                {records.some((r) => Number(r.systolic) >= 120) && (
                  <Link to="/artikel/memahami-tekanan-darah" className="btn btn-soft" style={{ minHeight: 38, fontSize: 12.5, display: 'inline-flex', marginBottom: 8 }}>
                    📚 Pelajari tentang tekanan darah
                  </Link>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 11.5, fontStyle: 'italic', color: 'var(--muted)' }}>{analysis.disclaimer}</p>
              </div>
            ) : analysisError ? (
              <p role="alert" style={{ marginTop: 12, fontSize: 13, color: '#b42318' }}>{analysisError}</p>
            ) : null}

            {analysisError && (
              <button type="button" className="btn btn-ghost" style={actionBtn} onClick={() => void runAnalysis()}><RefreshCw size={15} /> Coba Lagi</button>
            )}
            {!analysisLoading && !analysis && !analysisError && (
              <button type="button" className="btn btn-primary" style={actionBtn} onClick={() => void runAnalysis()}>Lihat Analisis</button>
            )}

          </section>

          {/* 📈 Tren Kesehatan */}
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📈 Tren Kesehatan</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Lihat perkembangan pemeriksaan Anda dari waktu ke waktu.</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {METRICS.map((item) => (
                <button key={item.id} type="button" onClick={() => { setMetric(item.id); void runTrend(item.id) }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line)', background: metric === item.id ? 'var(--teal)' : '#fff', color: metric === item.id ? '#fff' : 'var(--ink)', cursor: 'pointer' }}>
                  {item.label}
                </button>
              ))}
            </div>

            {trendLoading ? (
              <p style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}><Loader2 size={14} /> Menganalisis tren…</p>
            ) : trend ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: 0, fontSize: 14 }}>{trend.summary}</p>
                {trend.series?.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {trend.series.slice(0, 5).map((point) => (
                      <small key={point.date} style={{ background: 'var(--mint)', borderRadius: 8, padding: '4px 8px', fontSize: 11 }}>
                        {new Date(point.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · {point.value}
                      </small>
                    ))}
                  </div>
                )}
                <p style={{ margin: '10px 0 0', fontSize: 11.5, fontStyle: 'italic', color: 'var(--muted)' }}>{trend.disclaimer}</p>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" style={actionBtn} onClick={() => void runTrend()}>
                <TrendingUp size={15} /> Lihat Tren
              </button>
            )}
          </section>

          {/* 💬 Tanya AI */}
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>💬 Tanya AI</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Tanyakan tentang kesehatan Anda dengan bahasa sehari-hari.</p>

            {chatOpen ? (
              <>
                <div style={{ height: 230, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: 10, margin: '12px 0', background: 'var(--mint)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {messages.map((msg, index) => (
                    <div key={index} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 14, background: msg.sender === 'user' ? 'var(--teal)' : '#fff', color: msg.sender === 'user' ? '#fff' : 'var(--ink)', fontSize: 13.5, whiteSpace: 'pre-line' }}>
                      {msg.text}
                    </div>
                  ))}
                  {chatSending && <small style={{ color: 'var(--muted)' }}>✨ AI sedang menulis…</small>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {QUICK_QUESTIONS.map((question) => (
                    <button key={question} type="button" onClick={() => void sendChat(question)} disabled={chatSending}
                      style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer' }}>
                      {question}
                    </button>
                  ))}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void sendChat() }} style={{ display: 'flex', gap: 8 }}>
                  <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ketik pertanyaan kesehatan…" aria-label="Ketik pertanyaan"
                    style={{ flex: 1, minHeight: 46, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 12, fontSize: 14 }} />
                  <button type="submit" className="btn btn-primary" disabled={chatSending || !chatInput.trim()} aria-label="Kirim"><Send size={16} /></button>
                </form>
              </>
            ) : (
              <button type="button" className="btn btn-primary" style={actionBtn} onClick={() => setChatOpen(true)}>
                <MessageSquare size={15} /> Tanya Sekarang
              </button>
            )}
          </section>

          {/* 📚 Edukasi Kesehatan */}
          <section style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📚 Edukasi Kesehatan</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Informasi kesehatan sederhana dan mudah dipahami.</p>

            {showEducation ? (
              education ? (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 14 }}>💡 {education.intro}</p>
                  {education.topics?.map((topic) => (
                    <div key={topic.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                      <strong style={{ fontSize: 13.5 }}>{topic.title}</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13 }}>{topic.points.map((point, i) => <li key={i}>{point}</li>)}</ul>
                    </div>
                  ))}
                  {education.articles?.length > 0 && (
                    <>
                      <strong style={{ fontSize: 13 }}>Artikel dari petugas desa:</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13 }}>
                        {education.articles.map((article) => <li key={article.article_id}>{article.title} — {article.summary}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <p style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}><Loader2 size={14} /> Menyiapkan edukasi untuk Anda…</p>
              )
            ) : (
              <button type="button" className="btn btn-primary" style={actionBtn} onClick={() => void loadEducation()}>
                <BookOpen size={15} /> Baca
              </button>
            )}
          </section>

          {/* 🚨 Emergency stays primary & separate from AI */}
          <Link to="/warga/bantuan" className="btn btn-danger" style={{ width: '100%', minHeight: 52, fontWeight: 800 }}>
            🚨 Hubungi Petugas / Bantuan Darurat
          </Link>
        </div>
      </div>
    </div>
  )
}
