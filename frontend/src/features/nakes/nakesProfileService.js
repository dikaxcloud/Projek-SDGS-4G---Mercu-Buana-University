import { supabase, isSupabaseConfigured } from '../../lib/supabase'

// Fallback local storage for avatar when DB column not yet migrated
const LOCAL_AVATAR_KEY = (userId) => `nakes_avatar_${userId}`
const LOCAL_PROFILE_KEY = (userId) => `nakes_profile_${userId}`

export async function getMyNakesProfile() {
  if (!isSupabaseConfigured || !supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Try to fetch health_worker row for current user
  const { data, error } = await supabase.from('health_workers').select('*').eq('user_id', user.id).maybeSingle()
  if (error) {
    // fallback to local
    try {
      const raw = localStorage.getItem(LOCAL_PROFILE_KEY(user.id))
      if (raw) return JSON.parse(raw)
    } catch {}
    return null
  }
  if (!data) return null
  // Merge local avatar if DB has no avatar_url column
  try {
    const localAvatar = localStorage.getItem(LOCAL_AVATAR_KEY(user.id))
    if (localAvatar && !data.avatar_url) data.avatar_url = localAvatar
    const local = localStorage.getItem(LOCAL_PROFILE_KEY(user.id))
    if (local) {
      const parsed = JSON.parse(local)
      // merge extended fields
      if (parsed.whatsapp_number && !data.whatsapp_number) data.whatsapp_number = parsed.whatsapp_number
      if (parsed.work_status && !data.work_status) data.work_status = parsed.work_status
      if (parsed.is_siaga !== undefined && data.is_siaga === undefined) data.is_siaga = parsed.is_siaga
      if (parsed.services && !data.services) data.services = parsed.services
      if (parsed.schedule && !data.schedule) data.schedule = parsed.schedule
    }
  } catch {}
  return data
}

export async function updateMyNakesProfile(values) {
  if (!isSupabaseConfigured || !supabase) {
    // demo mode: store in localStorage
    try {
      const { data: { user } } = await supabase?.auth.getUser() || { data: { user: { id: 'demo-nakes' } } }
      const id = user?.id || 'demo-nakes'
      localStorage.setItem(LOCAL_PROFILE_KEY(id), JSON.stringify(values))
      if (values.avatar_url) localStorage.setItem(LOCAL_AVATAR_KEY(id), values.avatar_url)
    } catch {}
    return { status: 'updated' }
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Belum login')
  const payload = {}
  if (values.full_name !== undefined) payload.full_name = values.full_name?.trim() || null
  if (values.position !== undefined) payload.position = values.position?.trim() || null
  if (values.specialty !== undefined) payload.specialty = values.specialty?.trim() || null
  if (values.phone !== undefined) payload.phone = values.phone?.trim() || null
  // extended fields – try to save if columns exist, else fallback to localStorage
  const extended = {}
  if (values.avatar_url !== undefined) extended.avatar_url = values.avatar_url
  if (values.whatsapp_number !== undefined) extended.whatsapp_number = values.whatsapp_number
  if (values.work_status !== undefined) extended.work_status = values.work_status
  if (values.is_siaga !== undefined) extended.is_siaga = values.is_siaga
  if (values.services !== undefined) extended.services = values.services
  if (values.schedule !== undefined) extended.schedule = values.schedule

  // Try RPC first (if exists)
  try {
    const { data, error } = await supabase.rpc('update_my_nakes_profile', {
      p_full_name: payload.full_name,
      p_position: payload.position,
      p_specialty: payload.specialty,
      p_phone: payload.phone,
      p_avatar_url: extended.avatar_url || null,
      p_whatsapp_number: extended.whatsapp_number || null,
      p_work_status: extended.work_status || null,
      p_is_siaga: extended.is_siaga ?? null,
      p_services: extended.services || null,
      p_schedule: extended.schedule || null,
    })
    if (!error) return data
  } catch {}

  // Try direct table update (RLS may block, but try)
  try {
    const updatePayload = { ...payload }
    // only include extended if column exists – we attempt and ignore error
    if (extended.avatar_url) updatePayload.avatar_url = extended.avatar_url
    if (extended.whatsapp_number) updatePayload.whatsapp_number = extended.whatsapp_number
    if (extended.work_status) updatePayload.work_status = extended.work_status
    if (extended.is_siaga !== undefined) updatePayload.is_siaga = extended.is_siaga
    if (extended.services) updatePayload.services = extended.services
    if (extended.schedule) updatePayload.schedule = extended.schedule

    const { error } = await supabase.from('health_workers').update(updatePayload).eq('user_id', user.id)
    if (!error) {
      // also save to local as backup
      try { localStorage.setItem(LOCAL_PROFILE_KEY(user.id), JSON.stringify({ ...values })) } catch {}
      return { status: 'updated' }
    }
    throw error
  } catch (err) {
    // fallback to localStorage
    try {
      localStorage.setItem(LOCAL_PROFILE_KEY(user.id), JSON.stringify(values))
      if (values.avatar_url) localStorage.setItem(LOCAL_AVATAR_KEY(user.id), values.avatar_url)
    } catch {}
    // Surface friendly error if RLS blocks
    if (err?.message?.includes('row-level security') || err?.code === '42501') {
      // still return success via localStorage
      return { status: 'updated_local', warning: 'Disimpan lokal (DB belum mengizinkan update langsung). Admin dapat sinkronisasi.' }
    }
    throw err
  }
}

export async function uploadNakesAvatar(file) {
  if (!file) throw new Error('File tidak valid')
  if (file.size > 2 * 1024 * 1024) throw new Error('Foto maksimal 2MB')
  if (!file.type.startsWith('image/')) throw new Error('Hanya file gambar')
  if (!isSupabaseConfigured || !supabase) {
    // demo: return base64
    return await fileToDataUrl(file)
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Belum login')
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  // Try storage bucket 'avatars' or 'health-worker-avatars'
  let bucket = 'avatars'
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type })
    if (error) {
      // try alternative bucket
      if (error.message.includes('Bucket not found')) {
        bucket = 'health-worker-avatars'
        const { error: err2 } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type })
        if (err2) throw err2
      } else throw error
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    // fallback to base64
    console.warn('Storage upload failed, fallback to base64', e.message)
    const dataUrl = await fileToDataUrl(file)
    try { localStorage.setItem(LOCAL_AVATAR_KEY(user.id), dataUrl) } catch {}
    return dataUrl
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function getWorkerAvatarUrl(worker) {
  if (!worker) return null
  if (worker.avatar_url) return worker.avatar_url
  // try local storage for that worker's user_id
  if (worker.user_id) {
    try {
      const v = localStorage.getItem(LOCAL_AVATAR_KEY(worker.user_id))
      if (v) return v
    } catch {}
  }
  return null
}
