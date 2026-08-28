// Signup the three final-verification users and store their emails.
const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
const stamp = Date.now().toString().slice(-6)
async function signup(local) {
  const email = `e2e-fin-${local}.${stamp}@testmail.local`
  const res = await fetch(`${env.url}/auth/v1/signup`, { method: 'POST', headers: { apikey: env.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'E2eTest!2026x' }) })
  const body = await res.json().catch(() => ({}))
  if (!body.access_token && !body.session) { console.log('FAILED', local, res.status); process.exit(1) }
  return email
}
async function main() {
  const emails = { c: await signup('c'), admin: await signup('admin'), nakes: await signup('nakes') }
  fs.writeFileSync(path.join(__dirname, 'final_emails.json'), JSON.stringify(emails))
  console.log('USERS_READY', JSON.stringify(emails).replace(/\d{6}/g, 'XXXXXX'))
}
main()
