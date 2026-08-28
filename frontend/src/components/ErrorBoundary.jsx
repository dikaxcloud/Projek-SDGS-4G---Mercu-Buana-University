import { Component } from 'react'

/** Menampilkan pesan error yang jelas alih-alih layar putih. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (window.console) console.error('UI Error:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: 24 }}>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>⚠️ Terjadi kesalahan tampilan</h1>
            <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 6px' }}>Halaman ini gagal dirender. Coba muat ulang; jika berulang, screenshot pesan di bawah dan laporkan ke developer.</p>
            <pre style={{ background: '#fef2f2', color: '#b42318', padding: 12, borderRadius: 10, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Muat Ulang</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
