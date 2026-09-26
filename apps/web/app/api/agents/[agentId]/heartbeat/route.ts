import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { HeartbeatRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ agentId: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { agentId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const parsed = HeartbeatRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  // Fetch agent and verify it belongs to one of the user's projects
  const { data: agent } = await admin
    .from('agents')
    .select('*, projects!inner(owner_id)')
    .eq('id', agentId)
    .single()

  if (!agent) return apiError('Agent not found', 404)
  if ((agent as any).projects.owner_id !== userId) return apiError('Forbidden', 403)

  const now = new Date().toISOString()
  await admin
    .from('agents')
    .update({
      last_heartbeat_at: now,
      last_seen_at: now,
      status: parsed.data.status ?? agent.status,
      current_task_id: parsed.data.current_task_id !== undefined
        ? parsed.data.current_task_id
        : agent.current_task_id,
    })
    .eq('id', agentId)

  // Emit heartbeat event (lightweight — omit for most heartbeats to avoid bloat)
  // We only emit if task changed
  if (parsed.data.current_task_id !== undefined &&
      parsed.data.current_task_id !== agent.current_task_id) {
    await admin.rpc('insert_event', {
      p_project_id: agent.project_id,
      p_event_type: 'agent.heartbeat',
      p_task_id: parsed.data.current_task_id ?? null,
      p_agent_id: agentId,
      p_claim_id: parsed.data.claim_id ?? null,
      p_actor_type: 'agent',
      p_payload: {
        current_task_id: parsed.data.current_task_id,
        status: parsed.data.status,
      },
    })
  }

  return apiOk({ ok: true, server_time: now })
}
