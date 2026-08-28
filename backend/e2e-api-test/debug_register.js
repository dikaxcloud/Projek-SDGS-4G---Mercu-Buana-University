// Reproduce the exact new-registration flow against production.
const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
async function main() {
  const stamp = Date.now().toString().slice(-6)
  const email = `e2e-reg.${stamp}@testmail.local`

  let res = await fetch(`${env.url}/auth/v1/signup`, { method: 'POST', headers: { apikey: env.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'E2eTest!2026x' }) })
  const su = await res.json().catch(() => ({}))
  let token = su.access_token || su.session?.access_token
  if (!token) {
    res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'E2eTest!2026x' }) })
    token = (await res.json()).access_token
  }
  console.log('1) session:', Boolean(token))

  async function rpc(name, payload) {
    const r = await fetch(`${env.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await r.json().catch(() => null)
    console.log(`rpc ${name} -> ${r.status}`, JSON.stringify(body)?.slice(0, 220))
    return body
  }

  console.log('2) get_public_households RT 01:')
  const hh = await rpc('get_public_households', { p_rt_code: 'RT01' })
  const first = Array.isArray(hh) ? hh[0] : null
  console.log('   first:', JSON.stringify(first))

  console.log('3) register_citizen (payload persis frontend):')
  const reg = await rpc('register_citizen', {
    p_nik: ('32' + stamp + '4400').padEnd(16, '9').slice(0, 16),
    p_full_name: 'Debug Registrasi Baru',
    p_rt_code: 'RT 01',
    p_household_number: '',
    p_phone: '081299900099',
    p_birth_date: null,
    p_gender: 'laki-laki',
    p_blood_type: null,
    p_family_relation: 'anak',
    p_provider: 'google',
    p_birth_place: null,
    p_address: 'Jalan Debug 1',
    p_household_id: first?.household_id ?? null,
  })
  console.log('4) hasil akhir status:', reg?.status)
}
main()
