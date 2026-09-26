import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { StatusBadge } from '@/components/StatusBadge'
import { TaskDetailActions } from '@/components/TaskDetailActions'

type Params = { params: Promise<{ projectId: string; taskId: string }> }

export default async function TaskDetailPage({ params }: Params) {
  const { projectId, taskId } = await params
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

  const { data: task } = await admin
    .from('tasks')
    .select(`
      *,
      task_dependencies!task_dependencies_task_id_fkey(
        depends_on_task_id,
        dep:tasks!task_dependencies_depends_on_task_id_fkey(display_id, title, status)
      ),
      task_claims(id, status, claimed_at, lease_expires_at, released_at, attempt_number, rejection_reason),
      checkpoints(id, message, metadata_json, created_at),
      agents(id, display_name, stable_agent_id, status),
      file_reservations(id, path_pattern, status, expires_at)
    `)
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single()

  if (!task) redirect(`/projects/${projectId}/tasks`)

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}/tasks`} style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Tasks</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{task.display_id}</span>
      </header>

      <ProjectNav projectId={projectId} active="Tasks" />

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{task.display_id}</span>
              <StatusBadge status={task.status} />
              {task.risk && <StatusBadge status={task.risk} />}
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{task.title}</h1>
          </div>
          <TaskDetailActions task={task} projectId={projectId} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
          <div>
            {/* Description */}
            {task.description && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Description</h2>
                <p style={{ fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{task.description}</p>
              </section>
            )}

            {/* Acceptance criteria */}
            {task.acceptance_criteria_json?.length > 0 && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Acceptance Criteria</h2>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '14px', lineHeight: 1.8 }}>
                  {task.acceptance_criteria_json.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Checkpoints */}
            {task.checkpoints?.length > 0 && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Checkpoints ({task.checkpoints.length})
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {task.checkpoints.map((cp: any) => (
                    <div key={cp.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', fontSize: '13px' }}>
                      <div style={{ marginBottom: '0.25rem' }}>{cp.message}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(cp.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Claim history */}
            {task.task_claims?.length > 0 && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Claim History ({task.task_claims.length} attempts)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {task.task_claims.map((c: any) => (
                    <div key={c.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', fontSize: '12px' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <StatusBadge status={c.status} size="sm" />
                        <span style={{ color: 'var(--text-muted)' }}>Attempt #{c.attempt_number}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(c.claimed_at).toLocaleString()}</span>
                      </div>
                      {c.rejection_reason && (
                        <div style={{ color: 'var(--red)', marginTop: '0.25rem' }}>{c.rejection_reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Meta */}
            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', fontSize: '13px' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Priority:</span>{' '}
                <strong>{task.priority}</strong>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attempt:</span>{' '}
                <strong>#{task.attempt_number}</strong>
              </div>
              {task.agents && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Agent:</span>{' '}
                  <strong>{task.agents.display_name ?? task.agents.stable_agent_id}</strong>
                </div>
              )}
              {task.lease_expires_at && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Lease expires:</span>{' '}
                  <strong style={{ color: 'var(--yellow)' }}>{new Date(task.lease_expires_at).toLocaleString()}</strong>
                </div>
              )}
            </div>

            {/* Dependencies */}
            {task.task_dependencies?.length > 0 && (
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', fontSize: '13px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Depends on</h3>
                {task.task_dependencies.map((d: any) => (
                  <div key={d.depends_on_task_id} style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StatusBadge status={d.dep?.status ?? 'draft'} size="sm" />
                    <Link href={`/projects/${projectId}/tasks/${d.depends_on_task_id}`} style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {d.dep?.display_id}
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dep?.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* File reservations */}
            {task.file_reservations?.filter((r: any) => r.status === 'active').length > 0 && (
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', fontSize: '13px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>File Reservations</h3>
                {task.file_reservations.filter((r: any) => r.status === 'active').map((r: any) => (
                  <div key={r.id} style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--yellow)', marginBottom: '0.25rem' }}>
                    {r.path_pattern}
                  </div>
                ))}
              </div>
            )}

            {/* Verification commands */}
            {task.verification_commands_json?.length > 0 && (
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Verification</h3>
                {task.verification_commands_json.map((cmd: string, i: number) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', background: 'var(--bg-elevated)', padding: '3px 6px', borderRadius: '3px', marginBottom: '0.25rem' }}>
                    {cmd}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
