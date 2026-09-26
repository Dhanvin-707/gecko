import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenPullRequests } from '@/lib/github'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error

  const { project, error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const admin = createAdminClient()
  const { data: prs, error: dbErr } = await admin
    .from('pull_requests')
    .select('*, tasks(display_id, title), agents(display_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (dbErr) return apiError('Failed to fetch pull requests', 500)

  // Optionally enrich with live GitHub data
  let githubPRs: Awaited<ReturnType<typeof getOpenPullRequests>> = []
  try {
    githubPRs = await getOpenPullRequests(project.repository_owner, project.repository_name)
  } catch {
    // non-fatal
  }

  return apiOk({ pull_requests: prs, github_open_prs: githubPRs })
}
