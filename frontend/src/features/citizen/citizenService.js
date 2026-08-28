import { supabase } from '../../lib/supabase'

const demoContext = {
  profile: { citizen_id: 'demo-citizen-001', full_name: 'Budi Santoso', nik_last4: '0001', household_number: 'KK-01-01', rt_code: 'RT 01', gender: 'laki-laki', birth_date: '1980-05-12', blood_type: 'O+', family_relation: 'Kepala keluarga', phone: '08••••••001' },
  family: [
    { citizen_id: 'demo-citizen-001', full_name: 'Budi Santoso', nik_last4: '0001', family_relation: 'Kepala keluarga', gender: 'laki-laki' },
    { citizen_id: 'demo-citizen-005', full_name: 'Rina Wulandari', nik_last4: '0005', family_relation: 'Pasangan', gender: 'perempuan' },
    { citizen_id: 'demo-citizen-006', full_name: 'Dimas Santoso', nik_last4: '0006', family_relation: 'Anak', gender: 'laki-laki' },
  ],
}

const demoNotifications = [
  { notification_id: 'demo-notification-1', title: 'Pemeriksaan baru tersedia', message: 'Data pemeriksaan terakhir telah diperbarui oleh nakes desa.', created_at: '2026-08-23T08:30:00+07:00', read_at: null, notification_type: 'health_record' },
  { notification_id: 'demo-notification-2', title: 'Pengingat kesehatan', message: 'Jaga pola makan seimbang dan periksa berkala.', created_at: '2026-08-20T08:30:00+07:00', read_at: '2026-08-21T08:30:00+07:00', notification_type: 'info' },
]

export async function getCitizenContext() {
  if (!supabase) return demoContext
  const { data, error } = await supabase.rpc('get_my_citizen_context')
  if (error) throw error
  return data ?? { profile: null, family: [] }
}

export async function updateCitizenProfile({ fullName, phone, bloodType }) {
  if (!supabase) {
    demoContext.profile = { ...demoContext.profile, full_name: fullName, phone, blood_type: bloodType || demoContext.profile.blood_type }
    return { status: 'updated', profile: demoContext.profile }
  }
  const { data, error } = await supabase.rpc('update_my_citizen_profile', { p_full_name: fullName, p_phone: phone || null, p_blood_type: bloodType || null })
  if (error) throw error
  return data
}

export async function getCitizenNotifications() {
  if (!supabase) return demoNotifications
  const { data, error } = await supabase.from('notifications').select('notification_id,title,message,notification_type,read_at,created_at').order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data ?? []
}

export async function markCitizenNotificationRead(notificationId) {
  if (!supabase) {
    const item = demoNotifications.find((notification) => notification.notification_id === notificationId)
    if (item) item.read_at = new Date().toISOString()
    return item
  }
  const { data, error } = await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
  if (error) throw error
  return data
}
