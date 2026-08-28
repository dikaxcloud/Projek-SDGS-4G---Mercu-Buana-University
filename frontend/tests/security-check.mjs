import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w):/, '$1:'))
const files = [
  'src/lib/supabase.js',
  'src/features/auth/authService.js',
  'src/features/admin/adminService.js',
  'src/features/health/healthService.js',
  'src/pages/NakesCitizenPage.jsx',
  'src/features/citizen/citizenService.js',
]

async function source(file) { return readFile(resolve(root, file), 'utf8') }

test('frontend does not contain service role key or full NIK payload', async () => {
  for (const file of files) {
    const text = await source(file)
    assert.equal(text.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `${file}: service role key found`)
    assert.equal(/\bnik\s*[:=]\s*values?\./i.test(text), false, `${file}: full NIK payload found`)
  }
})

test('citizen routes use opaque IDs only', async () => {
  const app = await source('src/app/App.jsx')
  assert.equal(app.includes('/nik/'), false)
  assert.match(app, /\/nakes\/warga\/:citizenId/)
})

console.log(`Security scan passed: ${files.length} files checked`)
