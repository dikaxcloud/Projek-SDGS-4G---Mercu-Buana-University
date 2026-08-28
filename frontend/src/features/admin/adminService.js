import { supabase } from '../../lib/supabase'

const demo = {
  summary: { totalCitizens: 128, totalHouseholds: 50, totalRts: 5, totalHealthWorkers: 3, todayExaminations: 6, rtDistribution: [1, 2, 3, 4, 5].map((n) => ({ label: `RT ${String(n).padStart(2, '0')}`, total: 10 })) },
  citizens: [
    { citizen_id: 'demo-citizen-001', full_name: 'Budi Santoso', nik_last4: '0001', household_number: 'KK-01-01', rt_code: 'RT 01', phone: '08••••••001', gender: 'laki-laki', blood_type: 'O+', is_active: true },
    { citizen_id: 'demo-citizen-002', full_name: 'Rina Wulandari', nik_last4: '0002', household_number: 'KK-01-02', rt_code: 'RT 01', phone: '08••••••002', gender: 'perempuan', blood_type: 'A+', is_active: true },
  ],
  households: [1, 2, 3, 4, 5].flatMap((rt) => Array.from({ length: 3 }, (_, index) => ({ household_id: `demo-kk-${rt}-${index}`, household_number: `KK-${String(rt).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, head_name: index % 2 ? 'Rina Wulandari' : 'Budi Santoso', address: `Jalan Kenanga ${index + 1}`, rt_code: `RT ${String(rt).padStart(2, '0')}`, citizen_count: index + 1 }))),
  rts: [1, 2, 3, 4, 5].map((n) => ({ rt_id: `demo-rt-${n}`, code: `RT ${String(n).padStart(2, '0')}`, name: `RT ${String(n).padStart(2, '0')}`, household_count: 10, citizen_count: 25 })),
  workers: [{ health_worker_id: 'demo-worker-1', full_name: 'Siti Rahmawati', position: 'Bidan Desa', specialty: 'Kesehatan ibu & anak', phone: '08••••••001', is_online: true, is_active: true }, { health_worker_id: 'demo-worker-2', full_name: 'Dedi Prasetyo', position: 'Perawat Desa', specialty: 'Pemeriksaan umum', phone: '08••••••002', is_online: true, is_active: true }, { health_worker_id: 'demo-worker-3', full_name: 'Maya Lestari', position: 'Kader Kesehatan', specialty: 'Posyandu & edukasi', phone: '08••••••003', is_online: false, is_active: true }],
  profiles: [{ user_id: 'demo-admin', role: 'admin', display_name: 'Admin Desa', is_active: true, created_at: '2026-08-01' }, { user_id: 'demo-nakes', role: 'nakes', display_name: 'Siti Rahmawati', is_active: true, created_at: '2026-08-01' }],
  articles: [{ article_id: 'demo-article-1', title: 'Cara menjaga tekanan darah tetap sehat', slug: 'menjaga-tekanan-darah', summary: 'Kebiasaan sederhana untuk membantu menjaga tekanan darah.', content: 'Kurangi garam dan bergerak rutin.', is_published: true, updated_at: '2026-08-23' }],
  contacts: [{ emergency_contact_id: 'demo-contact-1', officer_name: 'Siti Rahmawati', label: 'Petugas kesehatan desa', phone: '08••••••001', whatsapp_url: 'https://wa.me/628120000001', sort_order: 1, is_active: true }],
  audit: [{ audit_log_id: 'demo-audit-1', actor_user_id: 'demo-admin', action: 'seed', entity: 'demo_data', metadata: { source: 'synthetic' }, created_at: '2026-08-23T08:00:00+07:00' }],
}

const demoRows = (key, query = '') => {
  const rows = demo[key] ?? []
  const clean = query.trim().toLowerCase()
  return clean ? rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(clean))) : rows
}
const call = async (name, params = {}) => { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data ?? [] }

export async function getAdminSummary() { if (!supabase) return demo.summary; return call('get_admin_summary') }

/** Promote/demote a Google user by email to nakes or warga (server-side guard). */
export async function setUserRoleByEmail(email, role) {
  if (!supabase) return { status: 'updated', role }
  return call('admin_set_user_role', { p_email: email, p_role: role })
}

/** Invite a new user (nakes/admin/warga) via Supabase Auth email invite.
 *  Only owner can invoke. Returns { status: 'invited', user } on success. */
export async function inviteUser(email, role, fullName = '') {
  if (!supabase) return { status: 'invited', role }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Belum login')
  
  // Ensure we have a fresh access token
  const { data: { session: freshSession }, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError || !freshSession) throw new Error('Sesi kedaluwarsa, silakan login ulang')
  
  const res = await fetch(`${supabase.supabaseUrl}/functions/v1/invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshSession.access_token}`,
    },
    body: JSON.stringify({ email, role, full_name: fullName.trim() || undefined }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) throw new Error(json.detail || json.error || json.message || 'Sesi tidak valid, silakan login ulang')
    throw new Error(json.error || json.message || 'Undangan gagal dikirim')
  }
  return json
}

/** True when the caller is the app owner (allowed to grant the admin role). */
export async function isAppOwner() {
  if (!supabase) return false
  const data = await call('is_app_owner')
  return Boolean(data)
}

/** Tier helpers: 1=Owner,2=Senior,3=Junior,4=Nakes,5=Warga */
export function getTier(access) {
  if (!access) return 5
  if (access.role === 'admin') return access.admin_tier ?? 3
  if (access.role === 'nakes') return 4
  return 5
}
export function tierLabel(tier) {
  if (tier === 1) return 'Owner'
  if (tier === 2) return 'Senior Admin'
  if (tier === 3) return 'Junior Admin'
  if (tier === 4) return 'Nakes'
  return 'Warga'
}
export async function setAdminTier(userId, tier) {
  if (!supabase) return { status: 'updated', tier }
  return call('admin_set_admin_tier', { p_user_id: userId, p_tier: tier })
}

/** Issue (or re-issue) the 30-minute activation challenge token for a verified citizen. */
export async function issueActivation(citizenId) {
  if (!supabase) return { status: 'issued', token: 'DEMO-ACTIV' }
  return call('admin_issue_activation', { p_citizen_id: citizenId })
}

/** Derive a wa.me link from an Indonesian phone number (08xx/62xx/8xx). */
export function waUrlFromPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('62')) return `https://wa.me/${digits}`
  if (digits.startsWith('0')) return `https://wa.me/62${digits.slice(1)}`
  if (digits.startsWith('8')) return `https://wa.me/62${digits}`
  return null
}

/** Permanently delete an emergency contact (admin only, audited server-side). */
export async function deleteAdminContact(emergencyContactId) {
  if (!supabase) {
    demo.contacts = demo.contacts.filter((row) => row.emergency_contact_id !== emergencyContactId)
    return { status: 'deleted' }
  }
  return call('admin_delete_emergency_contact', { p_emergency_contact_id: emergencyContactId })
}

/** Permanently delete a management resource row (citizen, KK, RT, worker, or user account). */
export async function deleteAdminResource(resource, row, withAccount = false) {
  if (!supabase) {
    const keys = { citizens: ['citizens', 'citizen_id'], households: ['households', 'household_id'], rts: ['rts', 'rt_id'], health_workers: ['workers', 'health_worker_id'], profiles: ['profiles', 'user_id'], emergency_contacts: ['contacts', 'emergency_contact_id'] }
    const [key, idKey] = keys[resource] ?? []
    if (key) demo[key] = demo[key].filter((item) => item[idKey] !== row[idKey])
    return { status: 'deleted' }
  }
  const map = {
    citizens: ['admin_delete_citizen', { p_citizen_id: row.citizen_id, p_with_account: Boolean(withAccount) }],
    households: ['admin_delete_household', { p_household_id: row.household_id }],
    rts: ['admin_delete_rt', { p_rt_id: row.rt_id }],
    health_workers: ['admin_delete_health_worker', { p_health_worker_id: row.health_worker_id }],
    profiles: ['admin_delete_user', { p_user_id: row.user_id }],
    emergency_contacts: ['admin_delete_emergency_contact', { p_emergency_contact_id: row.emergency_contact_id }],
  }
  const target = map[resource]
  if (!target) throw new Error('Jenis data tidak dikenal.')
  return call(target[0], target[1])
}

/** Move an emergency contact up/down by swapping sort_order with its neighbour. */
export async function moveAdminContact(emergencyContactId, direction) {
  if (!supabase) {
    const ordered = [...demo.contacts].sort((a, b) => a.sort_order - b.sort_order)
    const from = ordered.findIndex((row) => row.emergency_contact_id === emergencyContactId)
    const to = direction === 'up' ? from - 1 : from + 1
    if (from >= 0 && to >= 0 && to < ordered.length) {
      const swap = ordered[from].sort_order
      ordered[from].sort_order = ordered[to].sort_order
      ordered[to].sort_order = swap
    }
    return { status: 'moved' }
  }
  return call('admin_move_emergency_contact', { p_emergency_contact_id: emergencyContactId, p_direction: direction })
}
export async function listAdmin(resource, query = '') {
  if (!supabase) return demoRows(resource === 'health_workers' ? 'workers' : resource === 'emergency_contacts' ? 'contacts' : resource === 'audit_logs' ? 'audit' : resource, query)
  const names = { citizens: 'list_admin_citizens', households: 'list_admin_households', rts: 'list_admin_rts', health_workers: 'list_admin_health_workers', profiles: 'list_admin_profiles', articles: 'list_admin_articles', emergency_contacts: 'list_admin_emergency_contacts', audit_logs: 'list_admin_audit_logs' }
  const params = ['citizens', 'households'].includes(resource) ? { p_query: query, p_limit: 50, p_offset: 0 } : resource === 'health_workers' || resource === 'articles' ? { p_query: query } : resource === 'audit_logs' ? { p_limit: 50, p_offset: 0 } : {}
  return call(names[resource], params)
}
export async function saveAdmin(resource, values) {
  if (!supabase) {
    const keys = { citizen: ['citizens', 'citizen_id'], worker: ['workers', 'health_worker_id'], article: ['articles', 'article_id'], contact: ['contacts', 'emergency_contact_id'] }
    const [key, idKey] = keys[resource]
    const rows = demo[key]
    const index = rows.findIndex((row) => row[idKey] === values[idKey])
    const next = { ...values, [idKey]: values[idKey] || `demo-${resource}-${rows.length + 1}`, ...(resource === 'contact' ? { whatsapp_url: waUrlFromPhone(values.phone), sort_order: values.sort_order ?? rows.length + 1 } : {}) }
    if (index >= 0) rows[index] = next
    else rows.push(next)
    demo.audit.unshift({ audit_log_id: `demo-audit-${demo.audit.length + 1}`, actor_user_id: 'demo-admin', action: index >= 0 ? 'update' : 'create', entity: resource, metadata: { source: 'demo' }, created_at: new Date().toISOString() })
    return { status: 'saved', [idKey]: next[idKey] }
  }
  const names = {
    citizen: 'admin_update_citizen',
    worker: values.health_worker_id ? 'admin_update_health_worker' : 'admin_create_health_worker',
    article: values.article_id ? 'admin_update_article' : 'admin_create_article',
    contact: values.emergency_contact_id ? 'admin_update_emergency_contact' : 'admin_create_emergency_contact',
  }
  const payloads = {
    citizen: { p_citizen_id: values.citizen_id, p_full_name: values.full_name, p_phone: values.phone, p_birth_date: values.birth_date || null, p_gender: values.gender || null, p_blood_type: values.blood_type || null, p_is_active: values.is_active },
    worker: { p_health_worker_id: values.health_worker_id, p_full_name: values.full_name, p_position: values.position, p_specialty: values.specialty, p_phone: values.phone, p_is_online: values.is_online, p_is_active: values.is_active },
    article: values.article_id
      ? { p_article_id: values.article_id, p_title: values.title, p_slug: values.slug, p_summary: values.summary, p_content: values.content, p_is_published: values.is_published, p_category: values.category || null, p_thumbnail_url: values.thumbnail_url || null, p_is_archived: Boolean(values.is_archived) }
      : { p_title: values.title, p_slug: values.slug, p_summary: values.summary, p_content: values.content, p_is_published: values.is_published, p_category: values.category || null, p_thumbnail_url: values.thumbnail_url || null },
    contact: { p_emergency_contact_id: values.emergency_contact_id, p_label: values.label, p_phone: values.phone, p_whatsapp_url: null, p_sort_order: Number(values.sort_order) || 0, p_is_active: values.is_active, p_officer_name: values.officer_name || null },
  }
  return call(names[resource], payloads[resource])
}
export function getDemoAdminRows(resource, query) { return demoRows(resource, query) }
