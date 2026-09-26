import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { RequeueTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = RequeueTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('project_id, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const { data: result, error: rpcErr } = await admin.rpc('requeue_task', {
    p_project_id: task.project_id,
    p_task_id: taskId,
    p_claim_id: parsed.data.claim_id,
    p_reason: parsed.data.reason,
    p_actor_type: 'user',
    p_actor_id: userId,
  })

  if (rpcErr) return apiError('Requeue failed', 500)
  return apiOk(result)
}
