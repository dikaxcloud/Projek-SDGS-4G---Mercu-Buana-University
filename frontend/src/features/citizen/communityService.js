import { supabase } from '../../lib/supabase'

async function call(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export async function createServiceRequest(values) {
  if (!supabase) return { status: 'submitted', request_id: `demo-request-${Date.now()}` }
  return call('create_my_community_service_request', { p_title: values.title, p_category: values.category, p_description: values.description })
}

export async function listMyServiceRequests() {
  if (!supabase) return []
  return await call('list_my_community_service_requests') ?? []
}

export async function listCommunityActivities() {
  if (!supabase) return []
  return await call('list_public_community_health_activities') ?? []
}
