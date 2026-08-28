import { supabase } from './supabase'

export function subscribeToHealthChanges({ citizenId, onChange }) {
  if (!supabase || typeof onChange !== 'function') return () => {}
  const filter = citizenId ? `citizen_id=eq.${citizenId}` : undefined
  const channel = supabase.channel(`health-records-${citizenId || 'staff'}`).on('postgres_changes', { event: '*', schema: 'public', table: 'health_records', filter }, onChange).subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToNotifications({ userId, onChange }) {
  if (!supabase || !userId || typeof onChange !== 'function') return () => {}
  const channel = supabase.channel(`notifications-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onChange).subscribe()
  return () => { void supabase.removeChannel(channel) }
}

/** Realtime: notifikasi pendaftaran warga baru (INSERT tabel citizens). */
export function subscribeToCitizenInserts(onChange) {
  if (!supabase || typeof onChange !== 'function') return () => {}
  const channel = supabase
    .channel('citizens-new-registration')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citizens' }, (payload) => onChange(payload.new))
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToCitizenChanges(onChange) {
  if (!supabase || typeof onChange !== 'function') return () => {}
  const channel = supabase
    .channel('citizens-profile-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'citizens' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
