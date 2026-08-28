import { supabase } from '../../lib/supabase'

const demoContacts = [
  { emergency_contact_id: 'demo-contact-1', officer_name: 'Siti Rahmawati', label: 'Petugas kesehatan desa', phone: '081200000001', whatsapp_url: 'https://wa.me/628120000001', sort_order: 1, is_active: true },
  { emergency_contact_id: 'demo-contact-2', officer_name: 'Budi Santoso', label: 'Kantor Desa Kenanga', phone: '081200000010', whatsapp_url: 'https://wa.me/628120000010', sort_order: 2, is_active: true },
]

export async function getEmergencyContacts() {
  if (!supabase || navigator.onLine === false) return demoContacts
  try {
    const { data, error } = await supabase.from('emergency_contacts').select('emergency_contact_id,officer_name,label,phone,whatsapp_url,sort_order').eq('is_active', true).order('sort_order')
    if (error) throw error
    return data?.length ? data : demoContacts
  } catch {
    return demoContacts
  }
}
