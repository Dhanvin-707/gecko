import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReleaseTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = ReleaseTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('project_id, status, claim_id, assigned_agent_id, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  // Validate claim
  if (task.claim_id !== parsed.data.claim_id) {
    return apiError('Claim ID does not match active claim', 409)
  }

  // Release the claim
  await admin
    .from('task_claims')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', parsed.data.claim_id)

  // Reset task to ready
  await admin
    .from('tasks')
    .update({
      status: 'ready',
      assigned_agent_id: null,
      claim_id: null,
      lease_expires_at: null,
    })
    .eq('id', taskId)

  // Release file reservations
  await admin
    .from('file_reservations')
    .update({ status: 'released' })
    .eq('task_id', taskId)
    .eq('status', 'active')

  await admin.rpc('insert_event', {
    p_project_id: task.project_id,
    p_event_type: 'task.requeued',
    p_task_id: taskId,
    p_agent_id: task.assigned_agent_id,
    p_claim_id: parsed.data.claim_id,
    p_actor_type: 'agent',
    p_payload: { previous_claim_id: parsed.data.claim_id, reason: parsed.data.reason ?? 'released' },
  })

  return apiOk({ success: true })
}
