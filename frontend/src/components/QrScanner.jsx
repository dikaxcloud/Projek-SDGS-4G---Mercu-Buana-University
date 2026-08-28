import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff, Keyboard, QrCode } from 'lucide-react'

/** Reusable QR camera scanner — auto-detects QR codes from the live stream
 *  using jsQR frame decoding (works on every browser with getUserMedia). */
export function QrScanner({ onScan, hint, label = 'Mulai Scan QR' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const busyRef = useRef(false)
  const [cameraState, setCameraState] = useState('idle') // idle | on | denied
  const [manual, setManual] = useState('')

  const stopCamera = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraState('idle')
  }
  useEffect(() => () => stopCamera(), [])

  // Attach the stream once the <video> element is actually mounted (cameraState flip).
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
      // Auto-detect loop: grab frames, downscale, decode with jsQR every ~120ms.
      timerRef.current = setInterval(() => {
        if (busyRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return
        busyRef.current = true
        try {
          // Downscale besar frame agar decode lebih cepat & andal.
          const scale = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
          if (code?.data) {
            stopCamera()
            onScan(code.data)
            return
          }
        } catch { /* frame gagal — coba frame berikutnya */ }
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
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <video ref={videoRef} playsInline autoPlay muted style={{ width: '100%', maxWidth: 340, borderRadius: 16, background: '#000', aspectRatio: '3/4', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(13,40,37,.72)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 999 }}>🔍 Mencari QR code…</span>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={stopCamera}>Hentikan kamera</button>
          </div>
        </>
      )}
      {cameraState === 'idle' && (
        <button type="button" className="btn btn-primary btn-wide" onClick={() => void startCamera()}><QrCode size={17} /> {label}</button>
      )}
      {cameraState === 'denied' && (
        <p className="muted-text">Izin kamera ditolak. Aktifkan izin kamera atau gunakan input manual.</p>
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
