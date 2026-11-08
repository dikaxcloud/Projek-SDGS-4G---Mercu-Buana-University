import { supabase } from '../../lib/supabase'

async function call(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export async function listStaffServiceRequests(status = '') { return supabase ? (await call('list_staff_community_service_requests', { p_status: status }) ?? []) : [] }
export async function updateServiceRequest(requestId, status, responseNote) { return supabase ? call('update_community_service_request', { p_request_id: requestId, p_status: status, p_response_note: responseNote || null }) : { status } }
export async function listStaffActivities() { return supabase ? (await call('list_staff_community_health_activities') ?? []) : [] }
export async function createCommunityActivity(values) { return supabase ? call('create_community_health_activity', { p_title: values.title, p_description: values.description, p_location: values.location, p_starts_at: values.starts_at, p_ends_at: values.ends_at, p_registration_enabled: false, p_publish: values.publish }) : { status: values.publish ? 'published' : 'draft' } }
export async function updateActivityStatus(activityId, status) { return supabase ? call('update_community_health_activity_status', { p_activity_id: activityId, p_status: status }) : { status } }
