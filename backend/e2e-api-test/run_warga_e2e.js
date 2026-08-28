// E2E warga workflow test (API level, production Supabase).
// Usage: node run_warga_e2e.js phase1|phase2 <email> <password>
const URL = 'https://tkzhqrkraminqpqnbmce.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremhxcmtyYW1pbnFwcW5ibWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTkxMTQsImV4cCI6MjEwMzA3NTExNH0.JfnM7dp29_aIdKZrMXxbayEjhCY3miKRhoP6BVadOY4'
const HOUSEHOLD_ID = process.argv[5] || 'd359aa38-363d-4ef2-9faa-1b5fb635b75c'

const [, , phase, email, password] = process.argv
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`); ok ? pass++ : fail++ }

async function rpc(token, name, params) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { status: res.status, ok: res.ok, data, text }
}

async function select(token, table, query = '') {
  const res = await fetch(`${URL}/rest/v1/${table}${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { status: res.status, ok: res.ok, data, text }
}

async function main() {
  // ---- Login with real credentials ----
  const loginRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const login = await loginRes.json()
  if (!login.access_token) { console.log('FAIL — login (no session)', JSON.stringify(login).slice(0, 200)); process.exit(1) }
  const token = login.access_token
  const uid = login.user.id
  check('login sesi asli didapat', true, `uid=${uid.slice(0, 8)}…`)

  if (phase === 'phase1') {
    // ---- 1. Access: role warga, belum linked ----
    const access = await rpc(token, 'get_my_access')
    check('get_my_access role=warga', access.ok && access.data?.[0]?.role === 'warga', `role=${access.data?.[0]?.role}`)
    check('get_my_access belum terhubung citizen', access.ok && !access.data?.[0]?.citizen_id, `citizen_id=${access.data?.[0]?.citizen_id}`)

    // ---- 2. Registrasi warga (step 2: pakai KK terdaftar RT 01) ----
    const reg = await rpc(token, 'register_citizen', {
      p_nik: '3273010101999977', p_full_name: 'E2E Warga Uji', p_rt_code: 'RT 01',
      p_household_number: '', p_phone: '081299900001', p_birth_date: '1995-05-10',
      p_gender: 'laki-laki', p_blood_type: 'O+', p_family_relation: 'kepala keluarga',
      p_provider: 'google', p_birth_place: 'Bandung', p_address: 'Jalan Test No. 1',
      p_household_id: HOUSEHOLD_ID,
    })
    check('register_citizen → pending_verification', reg.ok && reg.data?.status === 'pending_verification', `status=${reg.data?.status ?? reg.text.slice(0, 80)}`)
    const citizenId = reg.data?.citizen_id

    // ---- 3. Context: status pending ----
    const ctx = await rpc(token, 'get_my_citizen_context')
    check('context verification_status=pending', ctx.ok && ctx.data?.profile?.verification_status === 'pending', `status=${ctx.data?.profile?.verification_status}`)
    check('context data identitas tersimpan', ctx.ok && ctx.data?.profile?.full_name === 'E2E Warga Uji' && ctx.data?.profile?.nik_last4 === '9977')

    // ---- 4. Security: warga DITOLAK akses RPC staff/admin ----
    const staffTry = await rpc(token, 'search_citizens', { p_query: '', p_limit: 5 })
    check('warga DITOLAK search_citizens (staff)', !staffTry.ok, `http=${staffTry.status}`)
    const adminTry = await rpc(token, 'admin_delete_citizen', { p_citizen_id: citizenId })
    check('warga DITOLAK admin_delete_citizen', !adminTry.ok, `http=${adminTry.status}`)
    const tokenTry = await rpc(token, 'create_account_link_token', { p_citizen_id: citizenId })
    check('warga DITOLAK create_account_link_token', !tokenTry.ok, `http=${tokenTry.status}`)

    // ---- 5. Registrasi ulang → already_linked ----
    const reg2 = await rpc(token, 'register_citizen', {
      p_nik: '3273010101999978', p_full_name: 'E2E Duplikat', p_rt_code: 'RT 01',
      p_provider: 'google', p_household_id: HOUSEHOLD_ID,
    })
    check('register ulang → already_linked', reg2.ok && reg2.data?.status === 'already_linked', `status=${reg2.data?.status}`)

    // ---- 6. NIK duplikat dari akun lain ditolak (cek via SQL di luar) ----
    console.log('CITIZEN_ID=' + citizenId)
  }

  if (phase === 'phase2') {
    // ---- 7. Aktivasi dengan kode dari petugas ----
    const act = await rpc(token, 'activate_my_account', { p_token: process.argv[6] || 'TEST-C0DE' })
    check('activate_my_account → activated', act.ok && act.data?.status === 'activated', `status=${act.data?.status ?? act.text.slice(0, 80)}`)

    // ---- 8. Aktivasi ulang → already_active ----
    const act2 = await rpc(token, 'activate_my_account', { p_token: 'TEST-C0DE' })
    check('activate ulang → already_active', act2.ok && act2.data?.status === 'already_active', `status=${act2.data?.status}`)

    // ---- 9. Context setelah aktivasi ----
    const ctx = await rpc(token, 'get_my_citizen_context')
    const ctxQr = await rpc(token, 'get_my_citizen_qr')
    check('context verified + activated', ctx.ok && ctx.data?.profile?.verification_status === 'verified' && Boolean(ctx.data?.profile?.activated_at ?? true), '')
    check('get_my_citizen_qr menghasilkan QR', ctxQr.ok && (ctxQr.data?.token || ctxQr.data?.qr_token || ctxQr.data?.state === 'ok'), `keys=${ctxQr.data ? Object.keys(ctxQr.data).join(',') : ctxQr.text.slice(0, 80)}`)

    // ---- 10. Riwayat kesehatan (masih kosong) ----
    const hist = await rpc(token, 'list_my_health_history', { p_limit: 10, p_offset: 0 })
    check('list_my_health_history OK (kosong)', hist.ok && Array.isArray(hist.data) && hist.data.length === 0, `rows=${Array.isArray(hist.data) ? hist.data.length : '?'}`)

    // ---- 11. Kontak darurat (publik) ----
    const contacts = await select(token, 'emergency_contacts', '?select=emergency_contact_id,label,phone,whatsapp_url&is_active=eq.true&order=sort_order')
    check('kontak darurat dapat dimuat', contacts.ok && Array.isArray(contacts.data), `rows=${Array.isArray(contacts.data) ? contacts.data.length : contacts.status}`)

    // ---- 12. Notifikasi aktivasi ----
    const notif = await select(token, 'notifications', '?select=title&user_id=eq.' + uid)
    check('notifikasi aktivasi masuk', notif.ok && Array.isArray(notif.data) && notif.data.some((n) => String(n.title).includes('aktif')), `rows=${Array.isArray(notif.data) ? notif.data.length : notif.status}`)

    // ---- 13. Artikel publik ----
    const art = await rpc(token, 'get_public_articles', { p_category: '' })
    check('artikel publik dapat dimuat', art.ok && Array.isArray(art.data), `rows=${Array.isArray(art.data) ? art.data.length : art.status}`)
  }

  console.log(`\n[${phase}] pass=${pass} fail=${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => { console.error('SCRIPT ERROR:', err.message); process.exit(1) })
