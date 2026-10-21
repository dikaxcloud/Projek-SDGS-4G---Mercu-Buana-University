export const IDENTITY_LENGTH = 16

export function normalizeIdentityNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, IDENTITY_LENGTH)
}

export function identityNumberError(value, label = 'Nomor identitas') {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return `${label} wajib diisi.`
  if (digits.length !== IDENTITY_LENGTH) return `${label} harus terdiri dari tepat 16 digit angka.`
  return ''
}

export function maskIdentityNumber(last4) {
  return last4 ? `${'*'.repeat(8)}${last4}` : 'Belum tersedia'
}

export function identityLast4(value) {
  const digits = normalizeIdentityNumber(value)
  return digits.length === IDENTITY_LENGTH ? digits.slice(-4) : ''
}
