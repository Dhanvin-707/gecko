import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateTaskRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const planId = searchParams.get('plan_id')

  const admin = createAdminClient()
  let query = admin
    .from('tasks')
    .select(`
      *,
      task_dependencies!task_dependencies_task_id_fkey(depends_on_task_id),
      agents(id, display_name, stable_agent_id, status)
    `)
    .eq('project_id', projectId)
    .order('priority', { ascending: false })

  if (status) query = query.eq('status', status)
  if (planId) query = query.eq('plan_id', planId)

  const { data, error: dbErr } = await query
  if (dbErr) return apiError('Failed to fetch tasks', 500)
  return apiOk(data)
}

export async function POST(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const body = await request.json().catch(() => null)
  const parsed = CreateTaskRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()

  // Generate a display_id if not provided
  let displayId = parsed.data.display_id
  if (!displayId) {
    const { count } = await admin
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    displayId = `TASK-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  const { data: task, error: dbErr } = await admin
    .from('tasks')
    .insert({
      project_id: projectId,
      plan_id: parsed.data.plan_id,
      display_id: displayId,
      title: parsed.data.title,
      description: parsed.data.description,
      acceptance_criteria_json: parsed.data.acceptance_criteria ?? [],
      expected_files_json: parsed.data.expected_files ?? [],
      verification_commands_json: parsed.data.verification_commands ?? [],
      priority: parsed.data.priority ?? 50,
      risk: parsed.data.risk,
      status: 'draft',
    })
    .select()
    .single()

  if (dbErr) return apiError('Failed to create task', 500)

  // Create dependencies
  if (parsed.data.depends_on?.length) {
    const depRows = parsed.data.depends_on.map((depId) => ({
      task_id: task.id,
      depends_on_task_id: depId,
    }))
    await admin.from('task_dependencies').insert(depRows)
  }

  await admin.rpc('insert_event', {
    p_project_id: projectId,
    p_event_type: 'task.created',
    p_task_id: task.id,
    p_agent_id: null,
    p_claim_id: null,
    p_actor_type: 'user',
    p_payload: { display_id: displayId, title: task.title, plan_id: parsed.data.plan_id },
  })

  return apiOk(task, 201)
}
