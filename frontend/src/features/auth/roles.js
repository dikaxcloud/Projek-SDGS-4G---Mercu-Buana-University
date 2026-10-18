/** Role aplikasi: 4 tingkat — Developer > RT/RW > Nakes > Warga. */
export const ROLES = {
  DEVELOPER: 'developer',
  RT_RW: 'rt_rw',
  NAKES: 'nakes',
  WARGA: 'warga',
}

export const ROLE_LABELS = {
  developer: 'Developer',
  rt_rw: 'RT/RW',
  nakes: 'Nakes',
  warga: 'Warga',
}

/** Warna badge role di UI (token yang sudah dipakai di desain). */
export const ROLE_COLORS = {
  developer: '#dc2626',
  rt_rw: '#7c3aed',
  nakes: '#0891b2',
  warga: '#16a34a',
}

/** Role yang boleh masuk ke area administration (/admin/*). */
export const ADMIN_ROLES = [ROLES.DEVELOPER, ROLES.RT_RW]

/** comparatively: True bila role caller >= role target (angka lebih kecil = lebih tinggi). */
const RANK = { developer: 1, rt_rw: 2, nakes: 3, warga: 4 }

export function roleRank(role) {
  return RANK[role] ?? 4
}

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? ROLE_LABELS.warga
}

/** True bila caller boleh mengubah role akun target (Developer saja, dan bukan developer). */
export function canChangeRole(callerRole, targetRole) {
  if (callerRole !== ROLES.DEVELOPER) return false
  return targetRole !== ROLES.DEVELOPER
}

/** True bila caller boleh menghapus akun target. */
export function canDeleteRole(callerRole, targetRole) {
  return canChangeRole(callerRole, targetRole)
}

/** Role yang boleh diundang lewat email: hanya RT/RW dan Nakes.
 *  Warga memakai alur pendaftaran mandiri (/registrasi), bukan undangan. */
export function invitableRoles(callerRole) {
  if (callerRole === ROLES.DEVELOPER) return [ROLES.RT_RW, ROLES.NAKES]
  if (callerRole === ROLES.RT_RW) return [ROLES.NAKES]
  return []
}

/** Role yang boleh dipasang lewat dropdown "ubah role" di daftar akun.
 *  Terpisah dari invitableRoles: Developer tetap bisa mengembalikan akun
 *  menjadi Warga (mis. koreksi role), walau Warga tidak bisa diundang. */
export function assignableRoles(callerRole) {
  if (callerRole === ROLES.DEVELOPER) return [ROLES.RT_RW, ROLES.NAKES, ROLES.WARGA]
  return []
}
