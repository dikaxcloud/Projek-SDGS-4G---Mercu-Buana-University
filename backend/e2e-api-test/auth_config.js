// Toggle Supabase auth "mailer_autoconfirm" via Management API.
// Usage: node auth_config.js get   |   node auth_config.js set <true|false>
const fs = require('fs')
const token = fs.readFileSync(__dirname + '/sb_token.txt', 'utf8').trim()
const REF = 'tkzhqrkraminqpqnbmce'
const api = 'https://api.supabase.com/v1/projects/' + REF + '/config/auth'

async function main() {
  const mode = process.argv[2] || 'get'
  const res = await fetch(api, { headers: { Authorization: 'Bearer ' + token } })
  if (!res.ok) { console.log('GET failed', res.status); process.exit(1) }
  const cfg = await res.json()
  console.log('current mailer_autoconfirm:', cfg.mailer_autoconfirm)
  if (mode === 'get') return
  const desired = mode === 'set' ? process.argv[3] === 'true' : undefined
  fs.writeFileSync(__dirname + '/auth_prev_value.txt', String(cfg.mailer_autoconfirm))
  const patch = await fetch(api, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailer_autoconfirm: desired }),
  })
  console.log('PATCH ->', patch.status)
  const after = await (await fetch(api, { headers: { Authorization: 'Bearer ' + token } })).json()
  console.log('now mailer_autoconfirm:', after.mailer_autoconfirm)
}
main().catch((e) => { console.log('ERR', e.message); process.exit(1) })
