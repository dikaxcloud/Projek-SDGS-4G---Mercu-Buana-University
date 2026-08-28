// E2E staff (nakes) flow tests against production Supabase.
const fs = require('fs')
const path = require('path')

const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
const URL_BASE = env.url
const ANON = env.anon
const FN_BASE = URL_BASE.replace('://', '://') + '/functions/v1/ai-health'

let passCount = 0
let failCount = 0
function report(name, ok, detail = '') {
  if (ok) { passCount++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) } else { failCount++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function signUp(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const raw = await res.text()
  let body = {}
  try { body = JSON.parse(raw) } catch {}
  if (!body.session && !body.access_token) console.log(`DEBUG signup B: status=${res.status} body=${raw.slice(0, 160)}`)
  return body.session ?? (body.access_token ? { access_token: body.access_token } : null)
}

async function rpc(name, payload, token) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return body.access_token ? { access_token: body.access_token } : null
}

async function main() {
  const stamp = Date.now().toString().slice(-6)
  const password = 'E2eTest!2026x'
  const existingEmail = process.argv[2] // reuse already-promoted test user
  const emailB = existingEmail || `e2e-warga-b.${stamp}@testmail.local`

  const sessionB = existingEmail ? await signIn(existingEmail, password) : await signUp(emailB, password)
  report('AUTH login Nakes-B (test)', Boolean(sessionB), emailB.replace(/\d{6}/, 'XXXXXX'))
  if (!sessionB) process.exit(1)
  const tokenB = sessionB.access_token

  // NOTE: B baru dibuat -> role masih warga sampai migration promote dijalankan.
  let r = await rpc('list_staff_rts', {}, tokenB)
  if (r.status >= 400 || !Array.isArray(r.body)) {
    console.log(`INFO list_staff_rts ditolak sebelum promote (expected): ${JSON.stringify(r.body).slice(0, 80)}`)
    console.log(`RUN_PROMOTE_MIGRATION_THEN_RERUN email=${emailB}`)
    process.exit(0)
  }

  // ---- Staff flows (setelah migration promote) ----
  r = await rpc('get_my_access', {}, tokenB)
  report('NAKES get_my_access role=nakes', r.body?.[0]?.role === 'nakes', `role=${r.body?.[0]?.role}`)

  r = await rpc('list_staff_rts', {}, tokenB)
  const rt01 = (r.body ?? []).find((rt) => rt.code === 'RT 01')
  report('NAKES list_staff_rts ada RT 01', Boolean(rt01), `${(r.body ?? []).length} RT`)

  r = await rpc('staff_create_household', {
    p_rt_id: rt01.rt_id,
    p_household_number: `KKE2E${stamp}`,
    p_head_name: 'E2E Kepala Keluarga',
    p_address: 'Alamat uji otomatis',
  }, tokenB)
  const kkId = r.body?.household_id
  report('NAKES staff_create_household KK baru', r.body?.status === 'created', kkId)

  const nikC = ('32' + stamp + '88' + String(Math.floor(Math.random() * 90) + 10)).padEnd(16, '7').slice(0, 16)
  const citizenName = `E2E Tester C ${stamp}`
  r = await rpc('staff_create_citizen', {
    p_nik: nikC, p_full_name: citizenName, p_household_id: kkId,
    p_family_relation: 'anak', p_phone: '081299900002',
  }, tokenB)
  const citizenId = r.body?.citizen_id
  report('NAKES staff_create_citizen warga baru', r.body?.status === 'created', citizenId)

  r = await rpc('staff_create_citizen', {
    p_nik: nikC, p_full_name: citizenName + ' DUP', p_household_id: kkId,
  }, tokenB)
  report('NIK DUPLICATE terdeteksi tanpa membuat data ganda', r.body?.status === 'duplicate' && r.body?.citizen_id === citizenId)

  r = await rpc('get_staff_citizen_detail', { p_citizen_id: citizenId }, tokenB)
  report('DETAIL get_staff_citizen_detail', r.status === 200 && r.body?.citizen_id === citizenId && r.body?.google?.connected === false, `KK=${r.body?.household?.household_number}`)

  r = await rpc('staff_update_citizen', {
    p_citizen_id: citizenId, p_full_name: citizenName + ' EDITED', p_phone: '081299900003',
    p_gender: 'laki-laki', p_blood_type: 'O+', p_is_active: true,
  }, tokenB)
  report('NAKES staff_update_citizen edit data dasar', r.body?.status === 'updated')

  r = await rpc('list_staff_citizens', { p_query: citizenName.slice(0, 10), p_status: 'pending' }, tokenB)
  const found = (r.body ?? []).find((row) => row.citizen_id === citizenId)
  report('SEARCH+FILTER list_staff_citizens menemukan warga', Boolean(found), found ? `connected=${found.google_connected} active=${found.is_active}` : '')

  r = await rpc('create_account_link_token', { p_citizen_id: citizenId }, tokenB)
  const code = typeof r.body === 'string' ? r.body : ''
  report('AKTIVASI kode format ABCD-1234 oleh nakes', /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code), code.replace(/[A-Z0-9]/g, 'X'))

  r = await rpc('admin_create_rt', { p_code: 'RT 99', p_name: 'RT 99 E2E' }, tokenB)
  report('SECURITY nakes DITOLAK admin_create_rt', r.status >= 400, `msg=${String(r.body?.message || '').slice(0, 50)}`)

  // ---- AI Edge Function dengan JWT sungguhan ----
  try {
    const fnRes = await fetch(FN_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', payload: { message: 'Apa arti tensi 130/85?' } }),
    })
    const fnBody = await fnRes.json().catch(() => ({}))
    report('AI chat via Edge Function (JWT asli)', fnRes.status === 200 && fnBody?.ok === true && String(fnBody?.data?.reply || '').length > 20, `status=${fnRes.status}`)
  } catch (e) {
    report('AI chat via Edge Function (JWT asli)', false, e.message)
  }

  console.log(`\nRINGKASAN STAFF: ${passCount} pass, ${failCount} fail`)
}
main().catch((err) => { console.error('RUNNER ERROR:', err.message); process.exit(1) })
