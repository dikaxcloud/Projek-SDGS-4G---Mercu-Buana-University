// Signup an E2E admin test user and print its (masked) email for the promote step.
const fs = require('fs')
const path = require('path')
const env = JSON.parse(fs.readFileSync(path.join(__dirname, 'public_keys.json'), 'utf8'))
const stamp = Date.now().toString().slice(-6)
const email = `e2e-admin.${stamp}@testmail.local`
async function main() {
  const res = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: env.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'E2eTest!2026x' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!body.access_token && !body.session) { console.log('SIGNUP_FAILED', res.status); process.exit(1) }
  fs.writeFileSync(path.join(__dirname, 'admin_email.txt'), email)
  console.log('ADMIN_TEST_USER_READY', email.replace(/\d{6}/, 'XXXXXX'))
}
main()
