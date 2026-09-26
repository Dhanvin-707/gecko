import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRepoMetadata, getRecentCommits, getOpenPullRequests } from '@/lib/github'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { project, error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  // Optionally enrich with GitHub metadata
  let githubMeta = null
  try {
    githubMeta = await getRepoMetadata(project.repository_owner, project.repository_name)
  } catch {
    // non-fatal
  }

  return apiOk({ ...project, github: githubMeta })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { project, error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const body = await request.json().catch(() => ({}))
  const allowed = ['default_branch', 'status'] as const
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) return apiError('No updatable fields', 400)

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('projects')
    .update(update)
    .eq('id', project.id)
    .select()
    .single()

  if (dbErr) return apiError('Failed to update project', 500)
  return apiOk(data)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { project, error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const admin = createAdminClient()
  await admin.from('projects').delete().eq('id', project.id)
  return new Response(null, { status: 204 })
}
