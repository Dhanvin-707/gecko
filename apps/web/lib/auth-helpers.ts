import { createAdminClient } from '@/lib/supabase/admin'
import { createRouteHandlerClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api'
import type { NextRequest } from 'next/server'

/**
 * Resolves the authenticated user from the current session.
 * Returns null and an error response if not authenticated.
 */
export async function requireUser(request: NextRequest) {
  const supabase = await createRouteHandlerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { user: null, userId: null, error: apiError('Unauthorized', 401) }
  }

  // Map Supabase auth user to internal user record
  const admin = createAdminClient()
  const { data: dbUser } = await admin
    .from('users')
    .select('id')
    .eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10))
    .single()

  if (!dbUser) {
    return { user: null, userId: null, error: apiError('User profile not found', 404) }
  }

  return { user, userId: dbUser.id as string, error: null }
}

/**
 * Verifies the authenticated user owns the given project.
 * Returns the project row or an error response.
 */
export async function requireProjectAccess(userId: string, projectId: string) {
  const admin = createAdminClient()
  const { data: project, error } = await admin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .single()

  if (error || !project) {
    return { project: null, error: apiError('Project not found', 404) }
  }

  return { project, error: null }
}

/**
 * Verifies the agent belongs to the given project.
 */
export async function requireAgentInProject(agentId: string, projectId: string) {
  const admin = createAdminClient()
  const { data: agent, error } = await admin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('project_id', projectId)
    .single()

  if (error || !agent) {
    return { agent: null, error: apiError('Agent not found in project', 404) }
  }

  return { agent, error: null }
}

/**
 * Verifies the claim is active and belongs to the task.
 */
export async function requireActiveClaim(claimId: string, taskId: string) {
  const admin = createAdminClient()
  const { data: claim, error } = await admin
    .from('task_claims')
    .select('*')
    .eq('id', claimId)
    .eq('task_id', taskId)
    .eq('status', 'active')
    .single()

  if (error || !claim) {
    return { claim: null, error: apiError('Claim not found or inactive', 409, { reason: 'stale_claim' }) }
  }

  // Check lease
  if (new Date(claim.lease_expires_at) < new Date()) {
    return { claim: null, error: apiError('Lease expired', 409, { reason: 'lease_expired' }) }
  }

  return { claim, error: null }
}
