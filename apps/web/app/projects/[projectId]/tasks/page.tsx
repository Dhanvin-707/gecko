import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { StatusBadge } from '@/components/StatusBadge'
import { TaskActions } from '@/components/TaskActions'

type Params = { params: Promise<{ projectId: string }>; searchParams: Promise<{ status?: string }> }

export default async function TasksPage({ params, searchParams }: Params) {
  const { projectId } = await params
  const { status: filterStatus } = await searchParams
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
    .select('id, repository_owner, repository_name')
    .eq('id', projectId)
    .eq('owner_id', dbUser.id)
    .single()
  if (!project) redirect('/projects')

  let query = admin
    .from('tasks')
    .select(`
      id, display_id, title, status, priority, risk, attempt_number,
      assigned_agent_id,
      task_dependencies!task_dependencies_task_id_fkey(depends_on_task_id),
      agents(display_name, stable_agent_id)
    `)
    .eq('project_id', projectId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })

  if (filterStatus) query = (query as any).eq('status', filterStatus)

  const { data: tasks } = await query

  const statuses = [
    'draft', 'ready', 'claimed', 'in_progress', 'testing',
    'blocked', 'failed', 'stale', 'requeued', 'review', 'completed', 'cancelled',
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>
          {project.repository_owner}/{project.repository_name}
        </Link>
      </header>

      <ProjectNav projectId={projectId} active="Tasks" />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href={`/projects/${projectId}/tasks`} className={`badge ${!filterStatus ? 'badge--ready' : ''}`}>All</Link>
            {statuses.map((s) => (
              <Link
                key={s}
                href={`/projects/${projectId}/tasks?status=${s}`}
                className={`badge badge--${s}`}
                style={{ opacity: filterStatus === s ? 1 : 0.6 }}
              >
                {s.replace(/_/g, ' ')}
              </Link>
            ))}
          </div>
          <TaskActions projectId={projectId} />
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', fontSize: '12px', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', width: '90px' }}>ID</th>
                <th style={{ padding: '0.6rem 1rem', textAlign: 'left' }}>Title</th>
                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', width: '110px' }}>Status</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', width: '60px' }}>Priority</th>
                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', width: '140px' }}>Agent</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', width: '50px' }}>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {!tasks?.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No tasks found
                  </td>
                </tr>
              ) : (
                tasks.map((t: any) => (
                  <tr
                    key={t.id}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td style={{ padding: '0.6rem 1rem', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      <Link href={`/projects/${projectId}/tasks/${t.id}`} style={{ color: 'var(--accent)' }}>
                        {t.display_id}
                      </Link>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', fontSize: '13px' }}>
                      <Link href={`/projects/${projectId}/tasks/${t.id}`} style={{ color: 'var(--text)' }}>
                        {t.title}
                      </Link>
                    </td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <StatusBadge status={t.status} size="sm" />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {t.priority}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t.agents?.display_name ?? t.agents?.stable_agent_id ?? '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      {t.attempt_number}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
