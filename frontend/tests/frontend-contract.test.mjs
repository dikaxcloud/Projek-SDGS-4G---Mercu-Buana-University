import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w):/, '$1:'))
const read = (file) => readFile(resolve(root, file), 'utf8')

test('PWA manifest and offline shell are wired', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'))
  assert.equal(manifest.start_url, '/')
  assert.ok(manifest.icons.length > 0)
  assert.match(await read('index.html'), /manifest\.webmanifest/)
  assert.match(await read('src/main.jsx'), /serviceWorker\.register/)
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
  assert.match(await read('src/pages/ArticlesPage.jsx'), /access\?\.role === 'warga' \? '\/warga'/)
})

test('public health-team directory and nakes navigation stay role-safe', async () => {
  assert.match(await read('src/pages/LandingPage.jsx'), /\/tim-kesehatan/)
  assert.match(await read('src/app/App.jsx'), /HealthTeamPage/)
  assert.match(await read('src/layouts/StaffLayout.jsx'), /touch_my_nakes_presence/)
  assert.match(await read('src/layouts/StaffLayout.jsx'), /access\?\.role === 'admin'/)
})
