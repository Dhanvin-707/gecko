import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { requireActiveClaim } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CheckpointRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = CheckpointRequestSchema.safeParse(body)
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

  const { data: checkpoint, error: dbErr } = await admin
    .from('checkpoints')
    .insert({
      project_id: task.project_id,
      task_id: taskId,
      agent_id: task.assigned_agent_id,
      claim_id: parsed.data.claim_id,
      message: parsed.data.message,
      metadata_json: parsed.data.metadata ?? {},
    })
    .select()
    .single()

  if (dbErr) return apiError('Failed to create checkpoint', 500)

  await admin.rpc('insert_event', {
    p_project_id: task.project_id,
    p_event_type: 'task.checkpoint',
    p_task_id: taskId,
    p_agent_id: task.assigned_agent_id,
    p_claim_id: parsed.data.claim_id,
    p_actor_type: 'agent',
    p_payload: { claim_id: parsed.data.claim_id, message: parsed.data.message },
  })

  return apiOk(checkpoint, 201)
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
    .from('checkpoints')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (dbErr) return apiError('Failed to fetch checkpoints', 500)
  return apiOk(data)
}
