// Phase 3: warga QR + staff_guard denial
const URL = 'https://tkzhqrkraminqpqnbmce.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremhxcmtyYW1pbnFwcW5ibWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTkxMTQsImV4cCI6MjEwMzA3NTExNH0.JfnM7dp29_aIdKZrMXxbayEjhCY3miKRhoP6BVadOY4'
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`); ok ? pass++ : fail++ }
async function rpc(token, name, params) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(params ?? {}) })
  const text = await res.text(); let data = null; try { data = JSON.parse(text) } catch {}
  return { status: res.status, ok: res.ok, data, text }
}
async function main() {
  const login = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'e2e-warga@test.local', password: 'TestWarga123!' }) })).json()
  const token = login.access_token
  const qr = await rpc(token, 'get_my_citizen_qr')
  check('get_my_citizen_qr state=ready + token', qr.ok && qr.data?.state === 'ready' && Boolean(qr.data?.token), `state=${qr.data?.state}, token=${String(qr.data?.token).slice(0, 8)}…`)
  check('QR berisi identitas warga', qr.ok && qr.data?.full_name === 'E2E Warga Uji' && qr.data?.rt_code === 'RT 01', `name=${qr.data?.full_name}, rt=${qr.data?.rt_code}`)
  const regen = await rpc(token, 'regenerate_citizen_qr', { p_citizen_id: qr.data?.citizen_id || '6d7247b3-f479-4e0c-84b9-bd7ca8094d68' })
  check('warga DITOLAK regenerate_citizen_qr (staff)', !regen.ok, `http=${regen.status}`)
  console.log(`\n[phase3] pass=${pass} fail=${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}
main().catch((err) => { console.error('SCRIPT ERROR:', err.message); process.exit(1) })
