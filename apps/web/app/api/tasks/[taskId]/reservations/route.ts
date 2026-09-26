import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireActiveClaim } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReservationRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = ReservationRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('project_id, assigned_agent_id, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const { claim, error: claimErr } = await requireActiveClaim(parsed.data.claim_id, taskId)
  if (claimErr) return claimErr

  const expiresAt = new Date(claim.lease_expires_at).toISOString()

  const { data: reservation, error: dbErr } = await admin
    .from('file_reservations')
    .insert({
      project_id: task.project_id,
      task_id: taskId,
      agent_id: task.assigned_agent_id,
      path_pattern: parsed.data.path_pattern,
      status: 'active',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (dbErr) return apiError('Failed to create reservation', 500)

  await admin.rpc('insert_event', {
    p_project_id: task.project_id,
    p_event_type: 'file.reserved',
    p_task_id: taskId,
    p_agent_id: task.assigned_agent_id,
    p_claim_id: parsed.data.claim_id,
    p_actor_type: 'agent',
    p_payload: {
      claim_id: parsed.data.claim_id,
      path_pattern: parsed.data.path_pattern,
      reservation_id: reservation.id,
    },
  })

  return apiOk(reservation, 201)
}

export async function GET(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('project_id, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const { data, error: dbErr } = await admin
    .from('file_reservations')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (dbErr) return apiError('Failed to fetch reservations', 500)
  return apiOk(data)
}
