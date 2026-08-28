// E2E: role parity test — nakes & admin biasa (API level, production).
const URL = 'https://tkzhqrkraminqpqnbmce.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremhxcmtyYW1pbnFwcW5ibWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTkxMTQsImV4cCI6MjEwMzA3NTExNH0.JfnM7dp29_aIdKZrMXxbayEjhCY3miKRhoP6BVadOY4'
const HH = 'd359aa38-363d-4ef2-9faa-1b5fb635b75c'
const NAKES_UID = process.env.NAKES_UID || '18dfc040-b7b2-49f1-acf4-c53f84b9c892'
const OWNER_UID = 'b85f14fb-3c65-4ea1-aba8-c075af0e76c0'
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`); ok ? pass++ : fail++ }
async function rpc(token, name, params) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(params ?? {}) })
  const text = await res.text(); let data = null; try { data = JSON.parse(text) } catch {}
  return { status: res.status, ok: res.ok, data, text }
}
async function login(email, password) {
  const r = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()
  if (!r.access_token) throw new Error('login gagal: ' + JSON.stringify(r).slice(0, 120))
  return r.access_token
}

async function main() {
  // ================= NAKES =================
  const nk = await login('e2e-nakes@test.local', 'TestNakes123!')
  console.log('--- NAKES ---')
  let a = await rpc(nk, 'get_my_access')
  check('[nakes] role = nakes', a.data?.[0]?.role === 'nakes', `role=${a.data?.[0]?.role}`)

  // Fitur inti nakes
  check('[nakes] search_citizens (staff)', (await rpc(nk, 'search_citizens', { p_query: '', p_limit: 5 })).ok)
  check('[nakes] list_staff_rts', (await rpc(nk, 'list_staff_rts')).ok)
  check('[nakes] get_nakes_summary', (await rpc(nk, 'get_nakes_summary')).ok)

  // Parity: fitur admin kini terbuka
  check('[nakes] PARITY list_admin_citizens', (await rpc(nk, 'list_admin_citizens', { p_query: '', p_limit: 5, p_offset: 0 })).ok)
  check('[nakes] PARITY list_admin_emergency_contacts', (await rpc(nk, 'list_admin_emergency_contacts')).ok)
  check('[nakes] PARITY list_admin_audit_logs', (await rpc(nk, 'list_admin_audit_logs', { p_limit: 5, p_offset: 0 })).ok)
  check('[nakes] PARITY list_admin_profiles', (await rpc(nk, 'list_admin_profiles')).ok)

  // Parity aksi: buat KK baru → buat warga → verifikasi (suffix unik agar idempotent)
  const uniq = String(Date.now()).slice(-8)
  const rts = await rpc(nk, 'list_staff_rts')
  const rtId = rts.data?.[0]?.rt_id
  check('[nakes] list_staff_rts → rt_id ada', Boolean(rtId), `rt=${rts.data?.[0]?.code}`)
  const kk = await rpc(nk, 'staff_create_household', { p_rt_id: rtId, p_household_number: `E2E-KK-${uniq}`, p_head_name: 'E2E Kepala KK', p_address: 'Jalan Test No. 7' })
  check('[nakes] staff_create_household', kk.ok && kk.data?.household_id, `id=${kk.data?.household_id?.slice(0, 8)}… ${kk.ok ? '' : kk.text.slice(0, 60)}`)
  const c = await rpc(nk, 'staff_create_citizen', { p_nik: `327301010199${uniq.slice(-4)}`, p_full_name: 'E2E Nakes Warga', p_household_id: kk.data?.household_id, p_family_relation: 'anak', p_phone: '081299900011', p_birth_date: '2000-01-01', p_gender: 'perempuan', p_blood_type: 'A+' })
  check('[nakes] staff_create_citizen', c.ok && c.data?.citizen_id, `id=${c.data?.citizen_id?.slice(0, 8)}… ${c.ok ? '' : c.text.slice(0, 60)}`)
  const cid = c.data?.citizen_id
  const v = await rpc(nk, 'admin_verify_citizen', { p_citizen_id: cid, p_approve: true, p_reason: null })
  check('[nakes] PARITY admin_verify_citizen', v.ok && v.data?.status === 'verified', `status=${v.data?.status ?? v.text.slice(0, 60)}`)

  // Parity kontak darurat: create + delete
  const ct = await rpc(nk, 'admin_create_emergency_contact', { p_label: 'E2E Kontak Nakes', p_phone: '081299900019' })
  check('[nakes] PARITY admin_create_emergency_contact', ct.ok, `id=${ct.data?.emergency_contact_id?.slice(0, 8)}…`)
  check('[nakes] PARITY admin_delete_emergency_contact', (await rpc(nk, 'admin_delete_emergency_contact', { p_emergency_contact_id: ct.data?.emergency_contact_id })).ok)

  // Sensitif: harus DITOLAK untuk nakes
  check('[nakes] DITOLAK admin_set_user_role', !(await rpc(nk, 'admin_set_user_role', { p_email: 'e2e-admin@test.local', p_role: 'warga' })).ok)
  check('[nakes] DITOLAK admin_delete_user', !(await rpc(nk, 'admin_delete_user', { p_user_id: OWNER_UID })).ok)
  const delc = await rpc(nk, 'admin_delete_citizen', { p_citizen_id: cid, p_with_account: true })
  check('[nakes] hapus warga tanpa linked account (with_account = no-op)', delc.ok, `status=${delc.data?.status ?? delc.text.slice(0, 60)}`)
  check('[nakes] is_app_owner = false', (await rpc(nk, 'is_app_owner')).data === false)

  // ================= ADMIN BIASA =================
  const ad = await login('e2e-admin@test.local', 'TestAdmin123!')
  console.log('--- ADMIN BIASA ---')
  a = await rpc(ad, 'get_my_access')
  check('[admin] role = admin', a.data?.[0]?.role === 'admin', `role=${a.data?.[0]?.role}`)

  check('[admin] list_admin_profiles', (await rpc(ad, 'list_admin_profiles')).ok)
  check('[admin] list_admin_households', (await rpc(ad, 'list_admin_households', { p_query: '', p_limit: 5, p_offset: 0 })).ok)
  check('[admin] staff: search_citizens', (await rpc(ad, 'search_citizens', { p_query: '', p_limit: 5 })).ok)
  check('[admin] staff: list_staff_rts', (await rpc(ad, 'list_staff_rts')).ok)

  // Boleh: ubah role nakes <-> warga (bukan angkat admin)
  const d1 = await rpc(ad, 'admin_set_user_role', { p_email: 'e2e-nakes@test.local', p_role: 'warga' })
  check('[admin] set role nakes→warga', d1.ok && d1.data?.role === 'warga', `role=${d1.data?.role}`)
  const d2 = await rpc(ad, 'admin_set_user_role', { p_email: 'e2e-nakes@test.local', p_role: 'nakes' })
  check('[admin] set role warga→nakes', d2.ok && d2.data?.role === 'nakes', `role=${d2.data?.role}`)

  // Sensitif: angkat admin & hapus owner → DITOLAK
  check('[admin] DITOLAK angkat role admin (owner-only)', !(await rpc(ad, 'admin_set_user_role', { p_email: 'e2e-nakes@test.local', p_role: 'admin' })).ok)
  check('[admin] DITOLAK hapus akun owner', !(await rpc(ad, 'admin_delete_user', { p_user_id: OWNER_UID })).ok)
  check('[admin] is_app_owner = false', (await rpc(ad, 'is_app_owner')).data === false)

  // Cleanup via fitur: admin menghapus akun nakes test (warga/nakes boleh)
  const del = await rpc(ad, 'admin_delete_user', { p_user_id: NAKES_UID })
  check('[admin] hapus akun nakes test (boleh)', del.ok, `status=${del.data?.status ?? del.text.slice(0, 120)}`)

  console.log(`\nTOTAL pass=${pass} fail=${fail}`)
  console.log('CITIZEN_TO_CLEAN=' + cid)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((err) => { console.error('SCRIPT ERROR:', err.message); process.exit(1) })
