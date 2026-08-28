const SB = 'https://tkzhqrkraminqpqnbmce.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremhxcmtyYW1pbnFwcW5ibWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTkxMTQsImV4cCI6MjEwMzA3NTExNH0.JfnM7dp29_aIdKZrMXxbayEjhCY3miKRhoP6BVadOY4'
async function main() {
  const l = await fetch(`${SB}/rest/v1/rpc/get_public_landing_data`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}' })
  const text = await l.text()
  console.log('landing status:', l.status)
  console.log('landing body:', text.slice(0, 400))
  const d = JSON.parse(text)
  console.log('keys:', Object.keys(d))
  if (d.stats) console.log('stats ok:', JSON.stringify(d.stats).slice(0, 120))
  const e = await fetch(`${SB}/rest/v1/emergency_contacts?select=label&is_active=eq.true`, { headers: { apikey: ANON } })
  console.log('kontak darurat (anon):', e.status, (await e.text()).slice(0, 80))
}
main().catch((err) => console.error('ERR', err.message))
