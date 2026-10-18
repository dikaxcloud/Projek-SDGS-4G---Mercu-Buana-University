import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export const demoAccess = {
  warga: { user_id: 'demo-warga', role: 'warga', display_name: 'Budi Santoso', citizen_id: 'demo-citizen-001', nik_last4: '0001' },
  nakes: { user_id: 'demo-nakes', role: 'nakes', display_name: 'Siti Rahmawati', citizen_id: null, nik_last4: null },
  developer: { user_id: 'demo-developer', role: 'developer', display_name: 'Developer', citizen_id: null, nik_last4: null },
  rt_rw: { user_id: 'demo-rt-rw', role: 'rt_rw', display_name: 'Pengurus RT/RW', citizen_id: null, nik_last4: null },
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) throw new Error('Supabase belum dikonfigurasi. Gunakan akun demo untuk mencoba aplikasi.')
  // Redirect eksplisit ke /login supaya sesi hasil OAuth selalu kembali ke
  // halaman yang tahu cara menukar ?code dan meneruskan ke dashboard role.
  // Domain ini WAJIB terdaftar di Supabase Dashboard > Authentication > URL
  // Configuration > Redirect URLs, kalau tidak login akan muter-muter.
  const redirectTo = `${window.location.origin}/login`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
}

/** Timeout agar UI tidak nyangkut di loading selamanya saat RPC macet. */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} melebihi batas waktu (${Math.round(ms / 1000)} detik). Periksa koneksi lalu coba lagi.`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function getAccess() {
  if (!supabase) return null
  const { data, error } = await withTimeout(
    supabase.rpc('get_my_access'),
    15000,
    'Pemuatan profil akses',
  )
  if (error) throw error
  return data?.[0] ?? null
}

export async function registerCitizen(form) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  const payload = {
    p_nik: form.p_nik,
    p_full_name: form.p_full_name,
    p_rt_code: form.p_rt_code || '',
    p_household_number: form.p_household_number || '',
    p_phone: form.p_phone || null,
    p_birth_date: form.p_birth_date || null,
    p_gender: form.p_gender || null,
    p_blood_type: form.p_blood_type || null,
    p_family_relation: form.p_family_relation || null,
    p_provider: 'google',
    p_birth_place: form.p_birth_place || null,
    p_address: form.p_address || null,
  }
  if (form.p_household_id) payload.p_household_id = form.p_household_id
  const { data, error } = await supabase.rpc('register_citizen', payload)
  if (error) throw error
  return data
}

export async function linkAccount(token) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  const { data, error } = await supabase.rpc('link_account', { p_link_token: token, p_provider: 'google' })
  if (error) throw error
  return data
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}

/** Warga activates own account using the token from admin's activation QR. */
export async function activateMyAccount(token) {
  if (!supabase) return { status: 'activated' }
  const { data, error } = await supabase.rpc('activate_my_account', { p_token: token })
  if (error) throw error
  return data
}
