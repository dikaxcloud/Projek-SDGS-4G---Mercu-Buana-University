// Staff (admin/nakes) citizen & administration management service.
// All authorization happens server-side via RPC guards.
import { supabase } from '../../lib/supabase'
import { demoTimeline } from '../../services/demoData'

const demo = {
  rts: [1, 2, 3, 4, 5].map((n) => ({ rt_id: `demo-rt-${n}`, code: `RT ${String(n).padStart(2, '0')}`, name: `RT ${String(n).padStart(2, '0')}`, household_count: 10, citizen_count: 25 })),
  households: [1, 2, 3, 4, 5].flatMap((rt) => Array.from({ length: 3 }, (_, index) => ({
    household_id: `demo-kk-${rt}-${index}`,
    household_number: `KK-${String(rt).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    head_name: index % 2 ? 'Rina Wulandari' : 'Budi Santoso',
    address: `Jalan Kenanga ${index + 1}`,
    rt_code: `RT ${String(rt).padStart(2, '0')}`,
    rt_id: `demo-rt-${rt}`,
    citizen_count: index + 1,
  }))),
}

const call = async (name, params = {}) => {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export async function listStaffCitizens({ query = '', rt = '', status = '', limit = 50, offset = 0 } = {}) {
  if (!supabase) return []
  return call('list_staff_citizens', { p_query: query, p_rt: rt, p_status: status, p_limit: limit, p_offset: offset })
}

export async function listStaffRts() {
  if (!supabase) return demo.rts
  return call('list_staff_rts')
}

export async function listStaffHouseholds(query = '') {
  if (!supabase) return demo.households.filter((item) => !query || [item.household_number, item.head_name, item.rt_code].some((value) => value.toLowerCase().includes(query.toLowerCase())))
  return call('list_staff_households', { p_query: query, p_limit: 100, p_offset: 0 })
}

export async function listHouseholdMembers(householdId) {
  if (!supabase) return demo.households.slice(0, 3).map((item, index) => ({ citizen_id: `demo-citizen-${index}`, full_name: index % 2 ? 'Siti' : 'Andi', nik_last4: `000${index}`, family_relation: index ? 'Anak' : 'Kepala Keluarga', gender: index % 2 ? 'perempuan' : 'laki-laki', is_active: true, google_connected: index === 0 }))
  return call('list_household_members', { p_household_id: householdId })
}

/**
 * Create a citizen as staff.
 * Returns { status: 'created'|'duplicate', citizen_id? } — duplicate is NOT an exception.
 */
export async function createStaffCitizen(payload) {
  if (!supabase) return { status: 'created', citizen_id: `demo-staff-${Date.now()}` }
  return call('staff_create_citizen', {
    p_nik: payload.nik,
    p_full_name: payload.full_name,
    p_household_id: payload.household_id,
    p_family_relation: payload.family_relation || null,
    p_phone: payload.phone || null,
    p_birth_date: payload.birth_date || null,
    p_gender: payload.gender || null,
    p_blood_type: payload.blood_type || null,
  })
}

export async function updateStaffCitizen(values) {
  if (!supabase) return { status: 'updated' }
  return call('staff_update_citizen', {
    p_citizen_id: values.citizen_id,
    p_full_name: values.full_name,
    p_phone: values.phone || null,
    p_birth_date: values.birth_date || null,
    p_gender: values.gender || null,
    p_blood_type: values.blood_type || null,
    p_is_active: Boolean(values.is_active),
  })
}

export async function getStaffCitizenDetail(citizenId) {
  if (!supabase) {
    const record = demoTimeline[0] ?? {}
    return { citizen_id: citizenId, full_name: 'Budi Santoso', nik_last4: '0001', phone: '08••••••001', gender: 'laki-laki', birth_date: null, blood_type: 'O+', family_relation: 'Kepala Keluarga', is_active: true, household: { household_id: 'demo-kk-0', household_number: 'KK-01-01', address: 'Jalan Kenanga 1', rt_code: 'RT 01' }, google: { connected: false, email: null }, recent_records: [] }
  }
  const detail = await call('get_staff_citizen_detail', { p_citizen_id: citizenId })
  let recent = []
  try {
    const { data } = await supabase
      .from('health_records')
      .select('health_record_id,examined_at,complaint,blood_pressure_records(systolic,diastolic),blood_sugar_records(value_mg_dl,context)')
      .eq('citizen_id', citizenId)
      .order('examined_at', { ascending: false })
      .limit(5)
    recent = data ?? []
  } catch { /* detail still renders without history */ }
  return { ...detail, recent_records: recent }
}

export async function createStaffHousehold(payload) {
  if (!supabase) return { status: 'created', household_id: `demo-kk-new-${Date.now()}` }
  return call('staff_create_household', {
    p_rt_id: payload.rt_id,
    p_household_number: payload.household_number,
    p_head_name: payload.head_name,
    p_address: payload.address || null,
  })
}

export async function createAdminRt(code, name) {
  if (!supabase) return { status: 'created', rt_id: `demo-rt-new-${Date.now()}` }
  return call('admin_create_rt', { p_code: code, p_name: name })
}

export async function updateAdminRt(rtId, name) {
  if (!supabase) return { status: 'updated' }
  return call('admin_update_rt', { p_rt_id: rtId, p_name: name })
}

/** Generate a one-time activation code (format ABCD-1234, expires ~15 min). */
export async function createActivationCode(citizenId, minutes = 15) {
  if (!supabase) return 'DEMO-C0DE'
  return call('create_account_link_token', { p_citizen_id: citizenId, p_expires_in_minutes: minutes })
}

/** Status of the latest activation token for a citizen (active/expiring/expired/used/revoked/none). */
export async function getActivationStatus(citizenId) {
  if (!supabase) return { state: 'none' }
  return call('get_activation_status', { p_citizen_id: citizenId })
}

/** Revoke all pending activation tokens of a citizen. */
export async function revokeCitizenTokens(citizenId) {
  if (!supabase) return { status: 'revoked', count: 1 }
  return call('revoke_citizen_tokens', { p_citizen_id: citizenId })
}

/** Staff view of a verified citizen's active health QR token. */
export async function getCitizenQrForStaff(citizenId) {
  if (!supabase) return { state: 'none' }
  return call('get_citizen_qr_for_staff', { p_citizen_id: citizenId })
}

/** Regenerate a verified citizen's QR — old QR becomes invalid. */
export async function regenerateCitizenQr(citizenId) {
  if (!supabase) return { status: 'regenerated', token: 'DEMO-REGEN' }
  return call('regenerate_citizen_qr', { p_citizen_id: citizenId })
}

/** Resolve a scanned QR token into minimal citizen info (staff only). */
export async function resolveCitizenQr(token) {
  if (!supabase) return { found: false }
  return call('resolve_citizen_qr', { p_token: token })
}
