import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff, Keyboard, QrCode, Check, X } from 'lucide-react'

/** Premium QR scanner — 8 steps inspired: open → init → scanning (line+glow) → detected (scale+check) → processing */
export function QrScanner({ onScan, hint, label = 'Mulai Scan QR' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const busyRef = useRef(false)
  const [cameraState, setCameraState] = useState('idle') // idle | on | denied | detected | error
  const [manual, setManual] = useState('')
  const [detectAnim, setDetectAnim] = useState(false)

  const stopCamera = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraState('idle')
    setDetectAnim(false)
  }
  useEffect(() => () => stopCamera(), [])

  useEffect(() => {
    if (cameraState === 'on' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      const playback = videoRef.current.play()
      if (playback?.catch) playback.catch(() => {})
    }
  }, [cameraState])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraState('on')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      timerRef.current = setInterval(() => {
        if (busyRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return
        busyRef.current = true
        try {
          const scale = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
          if (code?.data) {
            // DETECTED — premium success animation before callback
            setDetectAnim(true)
            setCameraState('detected')
            clearInterval(timerRef.current)
            timerRef.current = null
            setTimeout(() => {
              stopCamera()
              onScan(code.data)
            }, 700)
            return
          }
        } catch { /* retry next frame */ }
        busyRef.current = false
      }, 120)
    } catch {
      setCameraState('denied')
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {cameraState === 'on' && (
        <>
          <div className="qr-premium-wrap">
            <video ref={videoRef} playsInline autoPlay muted className="qr-premium-video" />
            <div className="qr-premium-overlay" />
            <div className="qr-premium-frame">
              <div className="qr-premium-line" />
            </div>
            <span className="qr-premium-label">🔍 Mencari QR Code…<br /><small style={{ fontWeight: 400, opacity: .9 }}>Arahkan kamera ke QR warga</small></span>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={stopCamera}>Hentikan kamera</button>
          </div>
        </>
      )}
      {cameraState === 'detected' && (
        <div className="qr-premium-wrap" style={{ display: 'grid', placeItems: 'center', background: '#065f46' }}>
          <div className="qr-premium-frame success">
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.18)' }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#22c55e', display: 'grid', placeItems: 'center', color: 'white', animation: 'qr-success-pulse .5s ease-out' }}><Check size={28} /></span>
            </div>
          </div>
          <span className="qr-premium-label" style={{ background: '#22c55e' }}>✓ QR Terdeteksi — Memverifikasi…</span>
        </div>
      )}
      {cameraState === 'idle' && (
        <button type="button" className="btn btn-primary btn-wide" onClick={() => void startCamera()}><QrCode size={17} /> {label}</button>
      )}
      {cameraState === 'denied' && (
        <div style={{ padding: 16, borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          <p className="muted-text" style={{ color: '#7f1d1d' }}><CameraOff size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Izin kamera ditolak. Aktifkan izin kamera atau gunakan input manual.</p>
        </div>
      )}

      <label style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Keyboard size={15} /> Atau masukkan token manual</span>
        <input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Contoh: DXJG-HGHS atau DXJGHGHS" style={{ minHeight: 46, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 12, textTransform: 'uppercase' }} />
      </label>
      <button type="button" className="btn btn-ghost btn-wide" style={{ marginTop: 8 }} disabled={!manual.trim()} onClick={() => onScan(manual.trim())}>Periksa Token</button>
      {hint && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{hint}</p>}
    </div>
  )
}
