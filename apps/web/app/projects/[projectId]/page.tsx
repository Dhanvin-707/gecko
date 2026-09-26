import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { ProjectDashboardClient } from '@/components/ProjectDashboardClient'
import Link from 'next/link'

type Params = { params: Promise<{ projectId: string }> }

export default async function ProjectDashboardPage({ params }: Params) {
  const { projectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin
    .from('users')
    .select('id')
    .eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10))
    .single()

  if (!dbUser) redirect('/auth')

  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('owner_id', dbUser.id)
    .single()

  if (!project) redirect('/projects')

  // Load initial data
  const [
    { data: tasks },
    { data: agents },
    { data: plans },
    { data: events },
    { data: prs },
    { data: reservations },
  ] = await Promise.all([
    admin
      .from('tasks')
      .select('id, display_id, title, status, priority, assigned_agent_id, attempt_number')
      .eq('project_id', projectId)
      .order('priority', { ascending: false }),
    admin
      .from('agents')
      .select('id, display_name, stable_agent_id, status, current_task_id, last_heartbeat_at')
      .eq('project_id', projectId)
      .order('last_seen_at', { ascending: false }),
    admin
      .from('plans')
      .select('id, version, status, goal')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1),
    admin
      .from('events')
      .select('id, sequence_number, event_type, task_id, agent_id, created_at')
      .eq('project_id', projectId)
      .order('sequence_number', { ascending: false })
      .limit(20),
    admin
      .from('pull_requests')
      .select('id, github_pr_number, github_url, branch_name, status, task_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    admin
      .from('file_reservations')
      .select('id, path_pattern, status, task_id, agent_id, expires_at')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ])

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          ← Projects
        </Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontWeight: 600 }}>
          {project.repository_owner}/{project.repository_name}
        </span>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            padding: '2px 8px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
          }}
        >
          {project.default_branch}
        </span>
      </header>

      <ProjectNav projectId={projectId} active="Dashboard" />

      <ProjectDashboardClient
        project={project}
        initialTasks={tasks ?? []}
        initialAgents={agents ?? []}
        initialPlan={plans?.[0] ?? null}
        initialEvents={events ?? []}
        initialPRs={prs ?? []}
        initialReservations={reservations ?? []}
      />
    </div>
  )
}
