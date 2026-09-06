// Security helpers — XSS prevention, input sanitization
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function sanitizeText(value, maxLen = 500) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen).replace(/[\u0000-\u001F\u007F]/g, '')
}

export function sanitizeName(value) {
  return sanitizeText(value, 120).replace(/[^a-zA-Z0-9\s.'-]/g, '')
}

export function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15)
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim()) && email.length <= 254
}

export function isSafeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false
  const t = url.trim()
  if (/^javascript:/i.test(t) || /^data:/i.test(t) || /^vbscript:/i.test(t)) return false
  try { const u = new URL(t); return ['http:', 'https:'].includes(u.protocol) } catch { return false }
}

// Mask NIK/KK for display — never show full value
export function maskNik(last4) {
  if (!last4) return '••••'
  return `••••${String(last4).slice(-4)}`
}

// Simple client-side rate limiter (in-memory, per-action)
const _hits = new Map()
export function rateLimit(key, max = 5, windowMs = 60000) {
  const now = Date.now()
  const arr = (_hits.get(key) || []).filter((t) => now - t < windowMs)
  if (arr.length >= max) return false
  arr.push(now)
  _hits.set(key, arr)
  return true
}

export function sanitizeErrorMessage(msg) {
  if (import.meta.env.DEV) return msg
  // Production: strip internal detail (SQLSTATE, stack, paths)
  const s = String(msg || 'Terjadi kesalahan.')
  if (/SQLSTATE|database|stack|supabase|postgres|select \*|insert into/i.test(s)) return 'Terjadi kesalahan pada server. Silakan coba lagi.'
  if (s.length > 300) return s.slice(0, 300)
  return s
}
