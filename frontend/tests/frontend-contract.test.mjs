import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (file) => readFile(resolve(root, file), 'utf8')

test('PWA manifest and offline shell are wired', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'))
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.length > 0)
  assert.match(await read('index.html'), /manifest\.webmanifest/)
  const main = await read('src/main.jsx')
  const pwaLib = await read('src/lib/pwa.js')
  assert.match(main + pwaLib, /serviceWorker/)
  assert.match(pwaLib, /register\(['"]\/sw\.js['"]\)/)
  assert.match(await read('src/app/App.jsx'), /PwaUpdatePrompt/)
  assert.match(await read('src/lib/pwa.js'), /hasUnsavedChanges|__DS_HAS_UNSAVED_CHANGES/)
  assert.match(await read('public/sw.js'), /SKIP_WAITING/)
  // Ikon install harus berdimensi asli sesuai klaim sizes — Chrome menolak prompt jika tidak cocok.
  const { readFile: readBin } = await import('node:fs/promises')
  const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })
  for (const [file, size] of [['public/logo-192.png', 192], ['public/logo-512.png', 512], ['public/logo-maskable-192.png', 192], ['public/logo-maskable-512.png', 512]]) {
    const dim = pngSize(await readBin(resolve(root, file)))
    assert.equal(dim.w, size, `${file} harus ${size}x${size}`)
    assert.equal(dim.h, size, `${file} harus ${size}x${size}`)
  }
  const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`).join(',')
  assert.match(sizes, /192x192/)
  assert.match(sizes, /512x512/)
  assert.match(sizes, /maskable/)
})

test('realtime and demo routes are wired', async () => {
  assert.match(await read('src/lib/realtime.js'), /postgres_changes/)
  assert.match(await read('src/app/App.jsx'), /warga\/bantuan/)
  assert.match(await read('src/app/App.jsx'), /admin\/audit-log/)
})

test('admin can inspect pending citizens and nakes receives live registrations', async () => {
  assert.match(await read('src/pages/CitizenVerificationPage.jsx'), /Lihat data/)
  assert.match(await read('src/pages/CitizenVerificationPage.jsx'), /\/admin\/warga\/\$\{row\.citizen_id\}/)
  assert.match(await read('src/pages/NakesDashboard.jsx'), /subscribeToCitizenInserts/)
  assert.match(await read('src/pages/NakesDashboard.jsx'), /Warga baru masuk/)
})

test('citizen profile updates and article home respect active role', async () => {
  assert.match(await read('src/lib/realtime.js'), /subscribeToCitizenChanges/)
  assert.match(await read('src/pages/AdminManagementPage.jsx'), /subscribeToCitizenChanges/)
  assert.match(await read('src/pages/ArticlesPage.jsx'), /homePathFor\(access\?\.role\)/)
  assert.match(await read('src/features/auth/ProtectedRoute.jsx'), /role === ROLES\.DEVELOPER \|\| role === ROLES\.RT_RW/)
})

test('role system is developer / rt_rw / nakes / warga', async () => {
  const roles = await read('src/features/auth/roles.js')
  for (const role of ['developer', 'rt_rw', 'nakes', 'warga']) assert.match(roles, new RegExp(role))
  for (const legacy of ['admin_1', 'admin_2', 'admin_3', 'admin_tier']) {
    assert.doesNotMatch(await read('src/features/auth/authService.js'), new RegExp(legacy))
  }
  assert.match(await read('src/app/App.jsx'), /RoleRoute roles=\{ADMIN_ROLES\}/)
  assert.match(await read('src/layouts/AdminLayout.jsx'), /developerOnlyPaths/)
})

test('invitation selector only offers rt_rw and nakes; warga uses self-registration', async () => {
  const roles = await read('src/features/auth/roles.js')
  assert.match(roles, /assignableRoles/)
  const inviteFn = roles.slice(roles.indexOf('export function invitableRoles'), roles.indexOf('export function assignableRoles'))
  assert.match(inviteFn, /ROLES\.RT_RW, ROLES\.NAKES\]/)
  assert.doesNotMatch(inviteFn, /ROLES\.WARGA/)
  assert.match(await read('src/pages/AdminManagementPage.jsx'), /assignableRoles\(callerRole\)/)
})

test('public health-team directory and nakes navigation stay role-safe', async () => {
  assert.match(await read('src/pages/LandingPage.jsx'), /\/tim-kesehatan/)
  assert.match(await read('src/app/App.jsx'), /HealthTeamPage/)
  assert.match(await read('src/layouts/StaffLayout.jsx'), /touch_my_nakes_presence/)
  assert.match(await read('src/layouts/StaffLayout.jsx'), /ADMIN_ROLES\.includes\(access\?\.role\)/)
})
