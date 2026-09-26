import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireActiveClaim } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CompleteTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ taskId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { taskId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = CompleteTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('project_id, assigned_agent_id, attempt_number, projects!inner(owner_id)')
    .eq('id', taskId)
    .single()

  if (!task) return apiError('Task not found', 404)
  if ((task as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const { claim, error: claimErr } = await requireActiveClaim(parsed.data.claim_id, taskId)
  if (claimErr) return claimErr

  // Mark claim complete
  await admin
    .from('task_claims')
    .update({ status: 'completed', released_at: new Date().toISOString() })
    .eq('id', parsed.data.claim_id)

  // Mark task complete
  await admin
    .from('tasks')
    .update({
      status: 'completed',
      lease_expires_at: null,
    })
    .eq('id', taskId)

  // Release file reservations
  await admin
    .from('file_reservations')
    .update({ status: 'released' })
    .eq('task_id', taskId)
    .eq('status', 'active')

  // Create pull request record if provided
  if (parsed.data.pr_number && parsed.data.pr_url && parsed.data.branch_name) {
    await admin.from('pull_requests').upsert(
      {
        project_id: task.project_id,
        task_id: taskId,
        agent_id: task.assigned_agent_id,
        github_pr_number: parsed.data.pr_number,
        github_url: parsed.data.pr_url,
        branch_name: parsed.data.branch_name,
        status: 'open',
      },
      { onConflict: 'project_id,github_pr_number' },
    )
  }

  await admin.rpc('insert_event', {
    p_project_id: task.project_id,
    p_event_type: 'task.completed',
    p_task_id: taskId,
    p_agent_id: task.assigned_agent_id,
    p_claim_id: parsed.data.claim_id,
    p_actor_type: 'agent',
    p_payload: {
      claim_id: parsed.data.claim_id,
      branch_name: parsed.data.branch_name,
      pr_number: parsed.data.pr_number,
      pr_url: parsed.data.pr_url,
    },
  })

  return apiOk({ success: true })
}
