import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { UpdateTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select(`
      *,
      task_dependencies!task_dependencies_task_id_fkey(depends_on_task_id),
      task_claims(id, status, claimed_at, lease_expires_at, released_at, attempt_number),
      checkpoints(id, message, created_at),
      agents(id, display_name, stable_agent_id),
      projects!inner(owner_id)
    `)
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  return apiOk(task)
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = UpdateTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('project_id, status, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const update: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) update.title = parsed.data.title
  if (parsed.data.description !== undefined) update.description = parsed.data.description
  if (parsed.data.acceptance_criteria !== undefined)
    update.acceptance_criteria_json = parsed.data.acceptance_criteria
  if (parsed.data.expected_files !== undefined)
    update.expected_files_json = parsed.data.expected_files
  if (parsed.data.verification_commands !== undefined)
    update.verification_commands_json = parsed.data.verification_commands
  if (parsed.data.priority !== undefined) update.priority = parsed.data.priority
  if (parsed.data.risk !== undefined) update.risk = parsed.data.risk

  if (Object.keys(update).length === 0) return apiError('No updatable fields', 400)

  const { data, error: dbErr } = await admin
    .from('tasks')
    .update(update)
    .eq('id', taskId)
    .select()
    .single()

  if (dbErr) return apiError('Failed to update task', 500)
  return apiOk(data)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('project_id, status, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  // Only cancel — do not hard-delete so event history is preserved
  await admin
    .from('tasks')
    .update({ status: 'cancelled' })
    .eq('id', taskId)

  await admin.rpc('insert_event', {
    p_project_id: task.project_id,
    p_event_type: 'task.cancelled',
    p_task_id: taskId,
    p_agent_id: null,
    p_claim_id: null,
    p_actor_type: 'user',
    p_payload: { reason: 'user_cancelled' },
  })

  return apiOk({ success: true })
}
