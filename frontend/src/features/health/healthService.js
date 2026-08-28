import { supabase } from '../../lib/supabase'
import { demoTimeline } from '../../services/demoData'
import { clearOfflineMutation, enqueueOfflineMutation, listOfflineMutations, markOfflineMutationFailed } from '../../lib/offlineStore'

const demoCitizens = [
  { citizen_id: 'demo-citizen-001', full_name: 'Budi Santoso', nik_last4: '0001', household_number: 'KK-01-01', rt_code: 'RT 01', gender: 'laki-laki', age: 46 },
  { citizen_id: 'demo-citizen-002', full_name: 'Rina Wulandari', nik_last4: '0002', household_number: 'KK-01-02', rt_code: 'RT 01', gender: 'perempuan', age: 39 },
  { citizen_id: 'demo-citizen-003', full_name: 'Slamet Haryono', nik_last4: '0003', household_number: 'KK-02-01', rt_code: 'RT 02', gender: 'laki-laki', age: 58 },
  { citizen_id: 'demo-citizen-004', full_name: 'Maya Lestari', nik_last4: '0004', household_number: 'KK-03-04', rt_code: 'RT 03', gender: 'perempuan', age: 31 },
]

const demoRecords = demoTimeline.map((item, index) => ({
  health_record_id: `demo-record-${index}`,
  citizen_id: 'demo-citizen-001',
  citizen_name: 'Budi Santoso',
  examined_at: `2026-08-${String(23 - index * 3).padStart(2, '0')}T08:30:00+07:00`,
  type: item.title,
  summary: item.value,
  needs_follow_up: false,
}))

function hasNetwork() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function newDemoRecord(citizenId, values, idempotencyKey) {
  return {
    status: 'created',
    health_record_id: idempotencyKey,
    citizen_id: citizenId,
    citizen_name: values.citizenName,
    examined_at: new Date().toISOString(),
    type: 'Pemeriksaan umum',
    summary: values.systolic ? `${values.systolic}/${values.diastolic} mmHg` : 'Pemeriksaan umum',
    needs_follow_up: values.needsFollowUp,
  }
}

export function isDemoHealthSession(access) {
  return access?.user_id === 'demo-nakes'
}

export async function searchCitizens(query = '') {
  const cleanQuery = query.trim().slice(0, 60)
  if (!supabase) return demoCitizens.filter((citizen) => !cleanQuery || [citizen.full_name, citizen.household_number, citizen.rt_code].some((value) => value.toLowerCase().includes(cleanQuery.toLowerCase())))
  const { data, error } = await supabase.rpc('search_citizens', { p_query: cleanQuery, p_limit: 20 })
  if (error) throw error
  return data ?? []
}

export async function getCitizen(citizenId) {
  if (!supabase) return demoCitizens.find((citizen) => citizen.citizen_id === citizenId) ?? null
  const { data, error } = await supabase.rpc('get_citizen_by_id', { p_citizen_id: citizenId })
  if (error) throw error
  return data?.[0] ?? null
}

export function formatRecord(record) {
  if (record.type) return record
  const bp = record.blood_pressure_records?.[0]
  const sugar = record.blood_sugar_records?.[0]
  const weight = record.weight_records?.[0]
  const temperature = record.temperature_records?.[0]
  if (bp) return { ...record, type: 'Tekanan darah', summary: `${bp.systolic}/${bp.diastolic} mmHg` }
  if (sugar) return { ...record, type: 'Gula darah', summary: `${sugar.value_mg_dl} mg/dL · ${sugar.context}` }
  if (weight) return { ...record, type: 'Berat badan', summary: `${weight.weight_kg} kg` }
  if (temperature) return { ...record, type: 'Suhu tubuh', summary: `${temperature.temperature_c} °C` }
  return { ...record, type: 'Pemeriksaan umum', summary: 'Catatan tersedia' }
}

function buildRealtimeByDayDemo() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const today = new Date()
  const out = []
  for (let i = 4; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const label = `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`
    out.push({ label, total: 0, day: d.toISOString().slice(0, 10) })
  }
  // example: put some demo totals except today (to show empty today case)
  // keep last day (today) 0 to demonstrate "kosong"
  out[0].total = 4
  out[1].total = 7
  out[2].total = 5
  out[3].total = 9
  // out[4] (today) stays 0
  return out
}

export async function getNakesSummary() {
  if (!supabase) return { totalCitizens: 128, totalHouseholds: 50, todayExaminations: demoRecords.length, followUps: 7, byDay: buildRealtimeByDayDemo() }
  const { data, error } = await supabase.rpc('get_nakes_summary')
  if (error) throw error
  return data
}

export async function getRecentExaminations(citizenId) {
  if (!supabase) return demoRecords.filter((record) => !citizenId || record.citizen_id === citizenId)
  let query = supabase.from('health_records').select('health_record_id,citizen_id,examined_at,needs_follow_up,complaint,notes,blood_pressure_records(systolic,diastolic,pulse_bpm),blood_sugar_records(value_mg_dl,context),weight_records(weight_kg,height_cm),temperature_records(temperature_c),pulse_records(pulse_bpm)').order('examined_at', { ascending: false }).limit(30)
  if (citizenId) query = query.eq('citizen_id', citizenId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(formatRecord)
}

export async function getCitizenHealthSummary(citizenId) {
  const records = await getRecentExaminations(citizenId)
  return records.slice(0, 4)
}

export async function saveExamination({ citizenId, values, idempotencyKey, userId, skipQueue = false }) {
  if (!hasNetwork() && !skipQueue) {
    if (!userId) throw new Error('Sesi pengguna diperlukan untuk antrean offline.')
    const item = await enqueueOfflineMutation(userId, { mutationType: 'health_record', citizenId, values, idempotencyKey })
    return { status: 'queued', queue_id: item.id, health_record_id: idempotencyKey }
  }
  if (!supabase) {
    const result = newDemoRecord(citizenId, values, idempotencyKey)
    demoRecords.unshift(result)
    return result
  }
  const payload = {
    p_citizen_id: citizenId,
    p_complaint: values.complaint || null,
    p_notes: values.notes || null,
    p_needs_follow_up: values.needsFollowUp,
    p_reference_note: values.needsFollowUp ? 'Nilai berada di luar rentang referensi demo. Silakan diperiksa kembali oleh tenaga kesehatan.' : null,
    p_idempotency_key: idempotencyKey,
    p_blood_pressure: values.systolic ? { systolic: Number(values.systolic), diastolic: Number(values.diastolic), pulse_bpm: values.pulse ? Number(values.pulse) : null } : null,
    p_blood_sugar: values.sugar ? { value_mg_dl: Number(values.sugar), context: values.sugarContext } : null,
    p_weight: values.weight ? { weight_kg: Number(values.weight), height_cm: values.height ? Number(values.height) : null } : null,
    p_temperature_c: values.temperature ? Number(values.temperature) : null,
    p_pulse_bpm: values.pulse ? Number(values.pulse) : null,
  }
  try {
    const { data, error } = await supabase.rpc('create_health_record', payload)
    if (error) throw error
    return data
  } catch (error) {
    if (!skipQueue && userId && !hasNetwork()) {
      const item = await enqueueOfflineMutation(userId, { mutationType: 'health_record', citizenId, values, idempotencyKey })
      return { status: 'queued', queue_id: item.id, health_record_id: idempotencyKey }
    }
    throw error
  }
}

export async function syncOfflineMutations(userId) {
  const items = await listOfflineMutations(userId)
  const results = []
  for (const item of items) {
    if (item.mutationType !== 'health_record' || item.status === 'failed') continue
    try {
      const result = await saveExamination({ citizenId: item.citizenId, values: item.values, idempotencyKey: item.idempotencyKey, userId, skipQueue: true })
      await clearOfflineMutation(item.id)
      results.push({ item, result })
    } catch (error) {
      await markOfflineMutationFailed(item.id, error.message)
    }
  }
  return results
}

export function getDemoCitizens() { return demoCitizens }

// ---------- Real dashboard / history RPCs ----------

/** Nakes dashboard numbers + recent examinations (all real data). */
export async function getNakesDashboard() {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_nakes_dashboard')
  if (error) throw error
  return data
}

/** Nakes "Riwayat Pemeriksaan Saya" — only examinations performed by the caller. */
export async function getMyExaminations(limit = 20, offset = 0) {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_my_examinations', { p_limit: limit, p_offset: offset })
  if (error) throw error
  return data ?? []
}

/** Staff examination detail incl. examiner identity and citizen info. */
export async function getExaminationDetail(recordId) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_examination_detail', { p_health_record_id: recordId })
  if (error) throw error
  return data
}

/** Warga own history with real examiner names (paginated). */
export async function getMyHealthHistory(limit = 20, offset = 0) {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_my_health_history', { p_limit: limit, p_offset: offset })
  if (error) throw error
  return data ?? []
}

/** Public landing data: stats, active workers, published articles (anon OK). */
export async function getPublicLandingData() {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_public_landing_data')
  if (error) throw error
  return data
}

/** Published article list, optional category filter (public). */
export async function getPublicArticles(category = '') {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_public_articles', { p_category: category })
  if (error) throw error
  return data ?? []
}

/** Article detail by slug + related articles (public). */
export async function getPublicArticleBySlug(slug) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_public_article_by_slug', { p_slug: slug })
  if (error) throw error
  return data
}

/** Warga's own active health QR (token + identity context). */
export async function getMyCitizenQr() {
  if (!supabase) return { state: 'no_citizen' }
  const { data, error } = await supabase.rpc('get_my_citizen_qr')
  if (error) throw error
  return data
}

/** Registered households of an RT (masked KK) — used during citizen registration. */
export async function getPublicHouseholds(rtCode) {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_public_households', { p_rt_code: rtCode })
  if (error) throw error
  return data ?? []
}

/** Register a brand-new household with the real KK number (rate-limited). */
export async function registerNewHousehold({ rtCode, kkNumber, headName, address }) {
  if (!supabase) return { status: 'created', household_id: `demo-kk-${Date.now()}` }
  const { data, error } = await supabase.rpc('register_new_household', {
    p_rt_code: rtCode, p_kk_number: kkNumber, p_head_name: headName, p_address: address || null,
  })
  if (error) throw error
  return data
}
