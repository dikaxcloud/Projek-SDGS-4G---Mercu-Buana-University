import QRCode from 'qrcode'

/** Generate a PNG data URL for arbitrary text/URL content. */
export async function makeQrDataUrl(text, size = 320) {
  return QRCode.toDataURL(text, { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#134e4a', light: '#ffffff' } })
}

/** Trigger browser download of a data URL as PNG file. */
export function downloadQr(dataUrl, filename = 'qr.png') {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Open a printable window containing the QR image and caption. */
export function printQr(dataUrl, title, caption) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  const win = window.open('', '_blank', 'width=520,height=680')
  if (!win) return
  win.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:32px;text-align:center}
    img{width:340px;height:auto;border:1px solid #e5e7eb;border-radius:12px;padding:8px}
    h1{font-size:22px;margin:16px 0 6px}p{color:#4b5563;margin:4px 0;font-size:14px}</style></head>
    <body><h1>${esc(title)}</h1><img src="${esc(dataUrl)}" alt="QR"/><p>${esc(caption)}</p>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
    </body></html>`)
  win.document.close()
}
