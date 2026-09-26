import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreatePlanRequestSchema, CreateTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('plans')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })

  if (dbErr) return apiError('Failed to fetch plans', 500)
  return apiOk(data)
}

export async function POST(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { project, error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const body = await request.json().catch(() => null)
  const parsed = CreatePlanRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  // Get next version number
  const { data: lastPlan } = await admin
    .from('plans')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const version = parsed.data.version ?? (lastPlan ? lastPlan.version + 1 : 1)

  // Mark previous plans as superseded
  await admin
    .from('plans')
    .update({ status: 'superseded' })
    .eq('project_id', projectId)
    .eq('status', 'approved')

  const { data: plan, error: dbErr } = await admin
    .from('plans')
    .insert({
      project_id: projectId,
      version,
      source_file: parsed.data.source_file,
      goal: parsed.data.goal,
      generated_by: parsed.data.generated_by,
      status: 'draft',
    })
    .select()
    .single()

  if (dbErr) return apiError('Failed to create plan', 500)

  // Create tasks if provided
  if (parsed.data.tasks?.length) {
    const taskRows = parsed.data.tasks.map((t, i) => ({
      project_id: projectId,
      plan_id: plan.id,
      display_id: t.display_id ?? `TASK-${String(i + 1).padStart(3, '0')}`,
      title: t.title,
      description: t.description,
      acceptance_criteria_json: t.acceptance_criteria ?? [],
      expected_files_json: t.expected_files ?? [],
      verification_commands_json: t.verification_commands ?? [],
      priority: t.priority ?? 50,
      risk: t.risk,
      status: 'draft',
    }))
    await admin.from('tasks').insert(taskRows)
  }

  await admin.rpc('insert_event', {
    p_project_id: projectId,
    p_event_type: 'plan.generated',
    p_task_id: null,
    p_agent_id: null,
    p_claim_id: null,
    p_actor_type: 'user',
    p_payload: { plan_id: plan.id, version, goal: parsed.data.goal },
  })

  return apiOk(plan, 201)
}
