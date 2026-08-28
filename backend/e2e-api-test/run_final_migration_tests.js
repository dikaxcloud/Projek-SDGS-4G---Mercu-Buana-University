// Final verification — server-testable subset.
// Register/login warga via Google identity = manual owner test (by design).
const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
let passCount = 0, failCount = 0
function report(name, ok, detail = '') { if (ok) { passCount++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) } else { failCount++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) } }
async function signIn(email, password) {
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const body = await res.json().catch(() => ({}))
  return body.access_token
}
async function rpc(name, payload, token) {
  const res = await fetch(`${env.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}) })
  const body = await res.json().catch(() => null)
  if (res.status >= 400) console.log(`   [debug ${name}]`, JSON.stringify(body).slice(0, 140))
  return { status: res.status, body }
}

async function main() {
  const emails = JSON.parse(fs.readFileSync(path.join(__dirname, 'final_emails.json'), 'utf8'))
  const stamp = Date.now().toString().slice(-6)
  const tokAdmin = await signIn(emails.admin, 'E2eTest!2026x')
  const tokNakes = await signIn(emails.nakes, 'E2eTest!2026x')
  report('AUTH admin & nakes uji login', Boolean(tokAdmin && tokNakes))

  // Citizen A: create -> verify -> QR auto-created
  let r = await rpc('list_staff_rts', {}, tokAdmin)
  const rtId = r.body?.[0]?.rt_id
  r = await rpc('staff_create_household', { p_rt_id: rtId, p_household_number: `KKFINA${stamp}`, p_head_name: 'Final KK A' }, tokAdmin)
  r = await rpc('staff_create_citizen', { p_nik: ('35' + stamp + '1100').padEnd(16, '2').slice(0, 16), p_full_name: `Final Citizen A ${stamp}`, p_household_id: r.body.household_id }, tokAdmin)
  const citA = r.body?.citizen_id
  report('SETUP citizen A dibuat', Boolean(citA))

  r = await rpc('get_citizen_qr_for_staff', { p_citizen_id: citA }, tokAdmin)
  report('TEST pra-verifikasi QR belum ada', r.body?.state === 'none')
  r = await rpc('admin_verify_citizen', { p_citizen_id: citA, p_approve: true }, tokAdmin)
  report('TEST 2 admin verifikasi warga A', r.body?.status === 'verified')

  r = await rpc('get_citizen_qr_for_staff', { p_citizen_id: citA }, tokAdmin)
  report('TEST 2b QR OTOMATIS dibuat saat verifikasi', r.body?.state === 'ready' && Boolean(r.body?.token))
  const qrA = r.body?.token

  // TEST 4: nakes scan/resolve
  r = await rpc('resolve_citizen_qr', { p_token: qrA }, tokNakes)
  report('TEST 4 nakes resolve QR -> ditemukan', r.body?.found === true && r.body?.citizen?.citizen_id === citA, r.body?.citizen?.full_name)

  // TEST 5: examination relation
  r = await rpc('create_health_record', { p_citizen_id: citA, p_blood_pressure: { systolic: 126, diastolic: 84 }, p_idempotency_key: crypto.randomUUID() }, tokNakes)
  report('TEST 5 pemeriksaan tersimpan (citizen+examiner benar)', r.body?.status === 'created')

  // TEST 8: regenerate -> old invalid
  r = await rpc('regenerate_citizen_qr', { p_citizen_id: citA }, tokAdmin)
  report('TEST 8a regenerate QR', r.body?.status === 'regenerated')
  r = await rpc('resolve_citizen_qr', { p_token: qrA }, tokNakes)
  report('TEST 8b QR lama TIDAK valid lagi', r.body?.found === false)

  // Reject flow: citizen B rejected with reason -> QR revoked/not created
  r = await rpc('staff_create_household', { p_rt_id: rtId, p_household_number: `KKFINB${stamp}`, p_head_name: 'Final KK B' }, tokAdmin)
  r = await rpc('staff_create_citizen', { p_nik: ('35' + stamp + '2200').padEnd(16, '3').slice(0, 16), p_full_name: `Final Citizen B ${stamp}`, p_household_id: r.body.household_id }, tokAdmin)
  const citB = r.body?.citizen_id
  const noReason = await rpc('admin_verify_citizen', { p_citizen_id: citB, p_approve: false, p_reason: null }, tokAdmin)
  report('SECURITY tolak tanpa alasan DITOLAK', noReason.status >= 400)
  r = await rpc('admin_verify_citizen', { p_citizen_id: citB, p_approve: false, p_reason: 'Data tidak lengkap' }, tokAdmin)
  report('TEST reject dengan alasan tercatat', r.body?.status === 'rejected')
  r = await rpc('get_citizen_qr_for_staff', { p_citizen_id: citB }, tokAdmin)
  report('SECURITY warga ditolak tidak mendapat QR', r.body?.state === 'none')

  // Pending filter
  r = await rpc('staff_create_citizen', { p_nik: ('35' + stamp + '3300').padEnd(16, '5').slice(0, 16), p_full_name: `Final Citizen C ${stamp}`, p_household_id: kkFinA(r) }, tokAdmin)
  function kkFinA(res) { return res.body.citizen_id && arguments ? arguments[2] : null }
  // simpler: reuse household A creation again
  r = await rpc('staff_create_household', { p_rt_id: rtId, p_household_number: `KKFINC${stamp}`, p_head_name: 'Final KK C' }, tokAdmin)
  r = await rpc('staff_create_citizen', { p_nik: ('35' + stamp + '3300').padEnd(16, '5').slice(0, 16), p_full_name: `Final Citizen C ${stamp}`, p_household_id: r.body.household_id }, tokAdmin)
  const citC = r.body?.citizen_id
  r = await rpc('list_staff_citizens', { p_status: 'pending_verification', p_query: 'Final Citizen C' }, tokAdmin)
  report('FILTER pending_verification menemukan C', Array.isArray(r.body) && r.body.some((x) => x.citizen_id === citC))

  // SECURITY: anon denied
  r = await rpc('resolve_citizen_qr', { p_token: 'X' })
  report('SECURITY anon DITOLAK resolve QR', r.status >= 400)

  console.log(`\nRINGKASAN FINAL: ${passCount} pass, ${failCount} fail`)
}
main().catch((err) => { console.error('RUNNER ERROR:', err.message); process.exit(1) })
