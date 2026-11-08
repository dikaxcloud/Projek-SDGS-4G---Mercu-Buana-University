import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../..', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('health service scheduling enforces unique citizen registration and per-session queue number', async () => {
  const sql = await source('supabase/migrations/202611080001_health_service_scheduling.sql')
  assert.match(sql, /unique \(schedule_id, citizen_id\)/)
  assert.match(sql, /unique \(schedule_id, queue_number\)/)
  assert.match(sql, /for update/)
  assert.match(sql, /v_count >= v_schedule.capacity/)
  assert.match(sql, /citizen_access_ok\(v_citizen_id\)/)
  assert.match(sql, /complete_health_service_registration/)
  assert.match(sql, /health_record_id = p_health_record_id and citizen_id = v_citizen_id/)
})

test('service schedule UI has resident and staff routes', async () => {
  const app = await source('frontend/src/app/App.jsx')
  assert.match(app, /\/warga\/jadwal-pemeriksaan/)
  assert.match(app, /\/nakes\/jadwal-pemeriksaan/)
  assert.match(app, /\/admin\/jadwal-pemeriksaan/)
})

test('community service database keeps citizen requests private and validates activity status', async () => {
  const sql = await source('supabase/migrations/202611080002_community_services.sql')
  assert.match(sql, /community_service_requests/)
  assert.match(sql, /citizen_access_ok\(v_citizen_id\)/)
  assert.match(sql, /list_my_community_service_requests/)
  assert.match(sql, /status in \('draft', 'published', 'cancelled', 'completed'\)/)
})
