const SB = 'https://tkzhqrkraminqpqnbmce.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremhxcmtyYW1pbnFwcW5ibWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTkxMTQsImV4cCI6MjEwMzA3NTExNH0.JfnM7dp29_aIdKZrMXxbayEjhCY3miKRhoP6BVadOY4'
async function main() {
  // Tanpa auth -> harus 401
  const anon = await fetch(`${SB}/functions/v1/ai-health`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat', payload: { message: 'tes' } }) })
  console.log('anon (harus 401):', anon.status, (await anon.text()).slice(0, 100))
  // Dengan JWT warga -> harus jalan (200)
  const login = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pentest-warga@test.local', password: 'Pentest123!' }) })).json()
  const auth = await fetch(`${SB}/functions/v1/ai-health`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'education', payload: {} }) })
  console.log('warga education (harus 200):', auth.status, (await auth.text()).slice(0, 150))
}
main().catch((e) => console.error('ERR', e.message))
