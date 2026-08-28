// API-level E2E test runner for Desa Sehat Kenanga (production Supabase).
// Runs with real auth sessions created via Supabase Auth REST.
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, 'public_keys.json')
const env = JSON.parse(fs.readFileSync(envPath, 'utf8'))
const URL_BASE = env.url
const ANON = env.anon

let passCount = 0
let failCount = 0
function report(name, ok, detail = '') {
  if (ok) { passCount++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) } else { failCount++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function rpc(name, payload, token) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

async function signUp(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const raw = await res.text()
  let body = {}
  try { body = JSON.parse(raw) } catch { console.log('DEBUG raw:', raw.slice(0, 200)) }
  if (!body.session) console.log('DEBUG signup body:', raw.slice(0, 200))
  return { status: res.status, session: body.session, user: body.user ?? body, needsConfirm: !body.session && !!body.user }
}

async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, session: body.access_token ? body : null, error: body.error_description || body.msg || body.message }
}

async function main() {
  const stamp = Date.now().toString().slice(-6)
  const emailA = `e2e-warga-a.${stamp}@testmail.local`
  const emailB = `e2e-warga-b.${stamp}@testmail.local`
  const password = 'E2eTest!2026x'

  // ---- 1. Create warga A session ----
  let a = await signUp(emailA, password)
  if (!a.session) {
    console.log(`DEBUG signup: status=${a.status} needsConfirm=${a.needsConfirm} msg=${a.user && a.user.message ? a.user.message : ''}`)
    a = await signIn(emailA, password)
    if (!a.session) console.log(`DEBUG signin: ${a.error || 'no session'}`)
  }
  report('AUTH signup/login Warga A', Boolean(a.session), a.needsConfirm ? 'email confirmation required' : '')
  if (!a.session) { console.log('STOP: cannot create authenticated session.'); process.exit(1) }
  const tokenA = a.session.access_token

  // ---- 2. Role check via get_my_access ----
  let r = await rpc('get_my_access', {}, tokenA)
  report('WARGA get_my_access role=warga', r.status === 200 && r.body?.[0]?.role === 'warga', `role=${r.body?.[0]?.role}`)

  // ---- 3. Negative: warga must NOT access staff RPCs ----
  r = await rpc('search_citizens', { p_query: '' }, tokenA)
  report('SECURITY warga ditolak search_citizens', r.status >= 400)
  r = await rpc('list_staff_citizens', {}, tokenA)
  report('SECURITY warga ditolak list_staff_citizens', r.status >= 400)

  // ---- 4. Warga self-register into existing RT/KK ----
  const nikA = ('32' + stamp + '09' + String(Math.floor(Math.random() * 90) + 10)).padEnd(16, '3').slice(0, 16)
  console.log(`DEBUG NIK A len=${nikA.length}`)
  r = await rpc('register_citizen', {
    p_nik: nikA, p_full_name: 'E2E Tester A', p_rt_code: 'RT 01', p_household_number: 'KK-01-02',
    p_phone: '081299900001', p_family_relation: 'anggota keluarga lainnya', p_provider: 'google',
  }, tokenA)
  // provider google requires google identity; expect verification failure OR created depending on identity table
  const registeredDirectly = r.status === 200 && r.body?.status === 'created'
  if (registeredDirectly) {
    report('WARGA register_citizen ke KK existing', true, `citizen=${r.body.citizen_id}`)
  } else {
    // Email-session tanpa Google identity memang DITOLAK oleh desain (hanya Google Login).
    const rejectedByDesign = String(r.body?.message || '').includes('tidak dapat diverifikasi')
    report('WARGA register_citizen menolak sesi non-Google (by design)', rejectedByDesign, r.body?.message || '')
  }

  // If register blocked by google-identity requirement, link later via activation code after staff creates citizen.

  // ---- 5. Context readback (only own data) ----
  if (registeredDirectly) {
    r = await rpc('get_my_citizen_context', {}, tokenA)
    report('WARGA get_my_citizen_context profil ada', r.status === 200 && !!r.body?.profile?.citizen_id)
  }

  // ---- 6. Try to escalate own profile role (security audit) ----
  const patchRes = await fetch(`${URL_BASE}/rest/v1/profiles?user_id=eq.${a.session.user.id}`, {
    method: 'PATCH',
    headers: { apikey: ANON, Authorization: `Bearer ${tokenA}`, Prefer: 'return=representation', 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  })
  const patchBody = await patchRes.json().catch(() => [])
  const escalated = patchRes.status === 200 && Array.isArray(patchBody) && patchBody[0]?.role === 'admin'
  report('SECURITY warga TIDAK bisa mengubah role sendiri', !escalated, escalated ? '!!! CELAKA: self-role escalation BERHASIL' : 'ditolak server')

  console.log(`\nRINGKASAN: ${passCount} pass, ${failCount} fail`)
  console.log(`TEST_USER_A=${emailA}`)
}
main().catch((err) => { console.error('RUNNER ERROR:', err.message); process.exit(1) })
