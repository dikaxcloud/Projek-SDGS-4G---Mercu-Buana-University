import { supabase } from '../../lib/supabase'

const demoSchedules = [
  { schedule_id: 'demo-schedule-1', title: 'Pemeriksaan kesehatan rutin', description: 'Pemeriksaan tekanan darah, gula darah, berat badan, dan konsultasi singkat.', location: 'Balai Desa Kenanga', starts_at: '2026-11-15T08:00:00+07:00', ends_at: '2026-11-15T11:00:00+07:00', capacity: 30, registered_count: 12, status: 'open' },
]
const demoRegistrations = []

async function call(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export async function listServiceSchedules() {
  if (!supabase) return demoSchedules
  return await call('list_health_service_schedules') ?? []
}

export async function registerForService(scheduleId) {
  if (!supabase) {
    if (demoRegistrations.some((row) => row.schedule_id === scheduleId)) throw new Error('Anda sudah terdaftar pada jadwal ini.')
    const schedule = demoSchedules.find((row) => row.schedule_id === scheduleId)
    if (!schedule || schedule.registered_count >= schedule.capacity) throw new Error('Kuota jadwal sudah penuh.')
    const queue_number = schedule.registered_count + 1
    schedule.registered_count += 1
    demoRegistrations.unshift({ registration_id: `demo-registration-${Date.now()}`, schedule_id: scheduleId, queue_number, status: 'confirmed', ...schedule })
    return { status: 'confirmed', queue_number }
  }
  return call('register_health_service', { p_schedule_id: scheduleId })
}

export async function listMyServiceRegistrations() {
  if (!supabase) return demoRegistrations
  return await call('list_my_health_service_registrations') ?? []
}

export async function cancelServiceRegistration(registrationId) {
  if (!supabase) {
    const item = demoRegistrations.find((row) => row.registration_id === registrationId)
    if (!item) throw new Error('Pendaftaran tidak ditemukan.')
    item.status = 'cancelled'
    return { status: 'cancelled' }
  }
  return call('cancel_my_health_service_registration', { p_registration_id: registrationId })
}

export async function createServiceSchedule(values) {
  if (!supabase) return { schedule_id: `demo-schedule-${Date.now()}`, status: 'open' }
  return call('create_health_service_schedule', {
    p_title: values.title,
    p_description: values.description || null,
    p_location: values.location,
    p_starts_at: values.starts_at,
    p_ends_at: values.ends_at,
    p_capacity: Number(values.capacity),
  })
}

export async function listStaffServiceRegistrations(scheduleId) {
  if (!supabase) return demoRegistrations.filter((row) => row.schedule_id === scheduleId)
  return await call('list_staff_health_service_registrations', { p_schedule_id: scheduleId }) ?? []
}

export async function callNextServiceRegistration(scheduleId) {
  if (!supabase) return { status: 'empty' }
  return call('call_next_health_service_registration', { p_schedule_id: scheduleId })
}

export async function completeServiceRegistration(registrationId, healthRecordId) {
  if (!supabase) return { status: 'completed' }
  return call('complete_health_service_registration', { p_registration_id: registrationId, p_health_record_id: healthRecordId })
}

export async function updateServiceRegistrationStatus(registrationId, status) {
  if (!supabase) return { status }
  return call('update_health_service_registration_status', { p_registration_id: registrationId, p_status: status })
}
