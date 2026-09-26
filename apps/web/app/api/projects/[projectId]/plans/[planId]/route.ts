import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ projectId: string; planId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId, planId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('plans')
    .select('*, tasks(*)')
    .eq('id', planId)
    .eq('project_id', projectId)
    .single()

  if (dbErr || !data) return apiError('Plan not found', 404)
  return apiOk(data)
}

/** Approve a plan */
export async function POST(request: NextRequest, { params }: Params) {
  const { projectId, planId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const body = await request.json().catch(() => ({}))
  const action = body.action as string

  if (action !== 'approve') return apiError('Unknown action', 400)

  const admin = createAdminClient()
  const { data: plan } = await admin
    .from('plans')
    .select('*')
    .eq('id', planId)
    .eq('project_id', projectId)
    .single()

  if (!plan) return apiError('Plan not found', 404)
  if (plan.status !== 'draft') return apiError('Plan is not in draft status', 409)

  await admin
    .from('plans')
    .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
    .eq('id', planId)

  // Set draft tasks to ready
  await admin
    .from('tasks')
    .update({ status: 'ready' })
    .eq('plan_id', planId)
    .eq('status', 'draft')

  await admin.rpc('insert_event', {
    p_project_id: projectId,
    p_event_type: 'plan.approved',
    p_task_id: null,
    p_agent_id: null,
    p_claim_id: null,
    p_actor_type: 'user',
    p_payload: { plan_id: planId, approved_by: userId },
  })

  return apiOk({ success: true })
}
