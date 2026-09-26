import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CreateProjectRequestSchema, parseRepositoryUrl } from '@gecko/protocol'
import { getRepoMetadata } from '@/lib/github'

export async function GET(request: NextRequest) {
  const { userId, error } = await requireUser(request)
  if (error) return error

  const admin = createAdminClient()
  const { data: projects, error: dbErr } = await admin
    .from('projects')
    .select('*')
    .eq('owner_id', userId!)
    .order('created_at', { ascending: false })

  if (dbErr) return apiError('Failed to fetch projects', 500)
  return apiOk(projects)
}

export async function POST(request: NextRequest) {
  const { userId, error } = await requireUser(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const parsed = CreateProjectRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  const { repository_url, default_branch } = parsed.data
  const repoInfo = parseRepositoryUrl(repository_url)
  if (!repoInfo) return apiError('Invalid GitHub repository URL', 400)

  // Fetch repo metadata to confirm it exists and get default branch
  let meta: Awaited<ReturnType<typeof getRepoMetadata>> | null = null
  try {
    meta = await getRepoMetadata(repoInfo.owner, repoInfo.name)
  } catch {
    return apiError('Repository not found or not public', 404)
  }

  const admin = createAdminClient()
  const { data: project, error: dbErr } = await admin
    .from('projects')
    .insert({
      owner_id: userId,
      repository_url,
      repository_owner: repoInfo.owner,
      repository_name: repoInfo.name,
      default_branch: default_branch ?? meta.default_branch,
    })
    .select()
    .single()

  if (dbErr) {
    if (dbErr.code === '23505') return apiError('Project already exists', 409)
    return apiError('Failed to create project', 500)
  }

  // Emit project.created event
  await admin.rpc('insert_event', {
    p_project_id: project.id,
    p_event_type: 'project.created',
    p_task_id: null,
    p_agent_id: null,
    p_claim_id: null,
    p_actor_type: 'user',
    p_payload: {
      repository_url,
      repository_owner: repoInfo.owner,
      repository_name: repoInfo.name,
    },
  })

  return apiOk(project, 201)
}
