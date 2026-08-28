// E2E ADMIN flow tests against production Supabase — full feature sweep.
const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
const URL_BASE = env.url
const ANON = env.anon

let passCount = 0, failCount = 0
function report(name, ok, detail = '') {
  if (ok) { passCount++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) } else { failCount++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}
async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const body = await res.json().catch(() => ({}))
  return body.access_token
}
async function rpc(name, payload, token) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: token ? { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await res.json().catch(() => null)
  if (res.status >= 400) console.log(`   [debug ${name}]`, JSON.stringify(body).slice(0, 160))
  return { status: res.status, body }
}

async function main() {
  const email = fs.readFileSync(path.join(__dirname, 'admin_email.txt'), 'utf8').trim()
  const stamp = Date.now().toString().slice(-6)
  const token = await signIn(email, 'E2eTest!2026x')
  report('AUTH login admin test', Boolean(token))

  // ---------- Dashboard ----------
  let r = await rpc('get_my_access', {}, token)
  report('ADMIN get_my_access role=admin', r.body?.[0]?.role === 'admin', `role=${r.body?.[0]?.role}`)

  r = await rpc('get_admin_summary', {}, token)
  report('DASHBOARD get_admin_summary lengkap', r.status === 200 && ['totalCitizens','weekExaminations','neverExaminedCitizens','newCitizensThisWeek'].every((k) => k in (r.body ?? {})), `warga=${r.body?.totalCitizens}, minggu=${r.body?.weekExaminations}`)
  report('DASHBOARD aktivitas terbaru berisi data', Array.isArray(r.body?.recentExaminations), `${(r.body?.recentExaminations ?? []).length} item`)

  // ---------- Lists ----------
  for (const [name, args] of [['citizens', {}], ['households', {}], ['health_workers', {}], ['profiles', {}], ['emergency_contacts', {}], ['audit_logs', {}]]) {
    r = await rpc(`list_admin_${name}`, name === 'audit_logs' ? { p_limit: 10 } : {}, token)
    report(`LIST list_admin_${name}`, r.status === 200 && Array.isArray(r.body), `${(r.body ?? []).length} baris`)
  }
  r = await rpc('list_admin_articles', {}, token)
  const articleCount = (r.body ?? []).length
  report('LIST list_admin_articles', r.status === 200 && articleCount >= 10, `${articleCount} artikel`)

  // ---------- RT management ----------
  r = await rpc('admin_create_rt', { p_code: `RT ${stamp.slice(-2)}`, p_name: `RT Uji ${stamp}` }, token)
  const rtOk = r.body?.status === 'created'
  report('RT admin_create_rt', rtOk)
  const badRt = await rpc('admin_create_rt', { p_code: 'KODE SALAH', p_name: 'X' }, token)
  report('SECURITY format kode RT invalid ditolak', badRt.status >= 400 || badRt.body?.status !== 'created')
  if (rtOk) {
    r = await rpc('admin_update_rt', { p_rt_id: r.body.rt_id, p_name: `RT Uji ${stamp} Edit` }, token)
    report('RT admin_update_rt', r.body?.status === 'updated')
  }

  // ---------- Citizen creation via staff RPC (admin allowed) ----------
  r = await rpc('list_staff_rts', {}, token)
  const anyRt = (r.body ?? [])[0]
  r = await rpc('staff_create_household', { p_rt_id: anyRt.rt_id, p_household_number: `KKADM${stamp}`, p_head_name: 'E2E Admin KK', p_address: null }, token)
  const kkId = r.body?.household_id
  report('KK staff_create_household oleh admin', r.body?.status === 'created')
  r = await rpc('staff_create_citizen', { p_nik: ('33' + stamp + '77' + '12').padEnd(16, '4').slice(0, 16), p_full_name: `E2E Admin Citizen ${stamp}`, p_household_id: kkId }, token)
  const citizenId = r.body?.citizen_id
  report('WARGA staff_create_citizen oleh admin', r.body?.status === 'created', citizenId)

  // ---------- Article lifecycle ----------
  const slug = `e2e-artikel-${stamp}`
  r = await rpc('admin_create_article', { p_title: `E2E Artikel ${stamp}`, p_slug: slug, p_summary: 'Artikel uji end-to-end.', p_content: 'Paragraf satu.\n\nParagraf dua.', p_is_published: true, p_category: 'Gula Darah' }, token)
  report('ARTIKEL admin_create_article + kategori', r.body?.status === 'created')
  let pub = await rpc('get_public_articles', { p_category: 'Gula Darah' }, null)
  report('ARTIKEL tampil publik (anon)', (pub.body ?? []).some((a) => a.slug === slug))
  pub = await rpc('get_public_article_by_slug', { p_slug: slug }, null)
  report('ARTIKEL detail by slug (anon)', pub.status === 200 && pub.body?.article?.slug === slug && Array.isArray(pub.body.related))
  r = await rpc('admin_update_article', { p_article_id: (await rpc('list_admin_articles', {}, token)).body.find((a) => a.slug === slug).article_id, p_title: `E2E Artikel ${stamp}`, p_slug: slug, p_summary: 'Artikel uji.', p_content: 'Isi.', p_is_published: true, p_category: 'Gula Darah', p_is_archived: true }, token)
  report('ARTIKEL arsip (soft-hide) berhasil', r.body?.status === 'updated')
  pub = await rpc('get_public_articles', { p_category: '' }, null)
  report('ARTIKEL terarsip HILANG dari publik', !(pub.body ?? []).some((a) => a.slug === slug))

  // ---------- Activation QR backend ----------
  r = await rpc('create_account_link_token', { p_citizen_id: citizenId }, token)
  const codeOk = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2345679]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2345679]{4}$/.test(String(r.body))
  report('QR create_account_link_token format benar', codeOk)
  r = await rpc('get_activation_status', { p_citizen_id: citizenId }, token)
  report('QR get_activation_status state=active', r.body?.state === 'active', r.body?.state)
  r = await rpc('revoke_citizen_tokens', { p_citizen_id: citizenId }, token)
  report('QR revoke_citizen_tokens', r.body?.status === 'revoked')
  r = await rpc('get_activation_status', { p_citizen_id: citizenId }, token)
  report('QR status menjadi revoked setelah dicabut', r.body?.state === 'revoked')

  // ---------- Negative: anon denied admin RPCs ----------
  r = await rpc('get_admin_summary', {})
  report('SECURITY anon DITOLAK get_admin_summary', r.status >= 400)
  r = await rpc('list_admin_citizens', {})
  report('SECURITY anon DITOLAK list_admin_citizens', r.status >= 400)

  console.log(`\nRINGKASAN ADMIN: ${passCount} pass, ${failCount} fail`)
}
main().catch((err) => { console.error('RUNNER ERROR:', err.message); process.exit(1) })
