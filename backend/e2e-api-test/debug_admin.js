const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
async function main() {
  const email = fs.readFileSync(path.join(__dirname, 'admin_email.txt'), 'utf8').trim()
  const res = await fetch(`${env.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'E2eTest!2026x' }) })
  const body = await res.json()
  const token = body.access_token
  async function rpc(name, payload) {
    const r = await fetch(`${env.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    console.log(name, r.status, JSON.stringify(await r.json()).slice(0, 300))
    return r
  }
  const stamp = Date.now().toString().slice(-6)
  await rpc('admin_create_rt', { p_code: `RT ${stamp.slice(-2)}`, p_name: `Debug ${stamp}` })
  const rts = await fetch(`${env.url}/rest/v1/rpc/list_staff_rts`, { method: 'POST', headers: { apikey: env.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  const rtList = await rts.json()
  console.log('rts:', JSON.stringify(rtList).slice(0, 200))
  if (Array.isArray(rtList) && rtList[0]) {
    await rpc('staff_create_household', { p_rt_id: rtList[0].rt_id, p_household_number: `DBG${stamp}`, p_head_name: 'Debug KK', p_address: null })
  }
}
main()
