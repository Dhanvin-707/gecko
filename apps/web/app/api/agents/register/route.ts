import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { RegisterAgentRequestSchema } from '@gecko/protocol'

export async function POST(request: NextRequest) {
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = RegisterAgentRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  // Verify the project belongs to this user
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', parsed.data.project_id)
    .eq('owner_id', userId!)
    .single()

  if (!project) return apiError('Project not found', 404)

  const now = new Date().toISOString()

  // Upsert the agent by stable_agent_id within the project
  const { data: agent, error: dbErr } = await admin
    .from('agents')
    .upsert(
      {
        project_id: parsed.data.project_id,
        stable_agent_id: parsed.data.stable_agent_id,
        display_name: parsed.data.display_name,
        provider_name: parsed.data.provider_name,
        model_name: parsed.data.model_name,
        capabilities_json: parsed.data.capabilities ?? {},
        status: 'online',
        connected_at: now,
        last_heartbeat_at: now,
        last_seen_at: now,
      },
      { onConflict: 'project_id,stable_agent_id' },
    )
    .select()
    .single()

  if (dbErr) return apiError('Failed to register agent', 500)

  await admin.rpc('insert_event', {
    p_project_id: parsed.data.project_id,
    p_event_type: 'agent.connected',
    p_task_id: null,
    p_agent_id: agent.id,
    p_claim_id: null,
    p_actor_type: 'agent',
    p_payload: {
      stable_agent_id: parsed.data.stable_agent_id,
      display_name: parsed.data.display_name,
      provider_name: parsed.data.provider_name,
      model_name: parsed.data.model_name,
    },
  })

  return apiOk(agent, 201)
}
