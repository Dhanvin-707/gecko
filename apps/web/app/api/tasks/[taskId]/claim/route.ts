import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClaimTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = ClaimTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  // Fetch the task to get project_id and verify ownership
  const { data: task } = await admin
    .from('tasks')
    .select('project_id, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  // Verify agent belongs to the project
  const { data: agent } = await admin
    .from('agents')
    .select('id, project_id')
    .eq('id', parsed.data.agent_id)
    .eq('project_id', task.project_id)
    .single()

  if (!agent) return apiError('Agent not found in project', 404)

  const { data: result, error: rpcErr } = await admin.rpc('claim_task', {
    p_project_id: task.project_id,
    p_task_id: taskId,
    p_agent_id: parsed.data.agent_id,
    p_requested_claim_id: parsed.data.requested_claim_id ?? null,
    p_lease_seconds: parsed.data.lease_seconds,
    p_expected_task_version: parsed.data.expected_task_version ?? null,
  })

  if (rpcErr) return apiError('Claim failed', 500)

  const res = result as { success: boolean; reason?: string }
  if (!res.success) {
    return apiError(res.reason ?? 'Conflict', 409, result as Record<string, unknown>)
  }

  return apiOk(result)
}
