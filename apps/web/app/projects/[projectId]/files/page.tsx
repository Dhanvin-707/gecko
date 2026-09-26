import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { StatusBadge } from '@/components/StatusBadge'

type Params = { params: Promise<{ projectId: string }> }

export default async function FilesPage({ params }: Params) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin.from('users').select('id').eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10)).single()
  if (!dbUser) redirect('/auth')

  const { data: project } = await admin.from('projects').select('id, repository_owner, repository_name').eq('id', projectId).eq('owner_id', dbUser.id).single()
  if (!project) redirect('/projects')

  const { data: reservations } = await admin
    .from('file_reservations')
    .select('*, tasks(display_id, title), agents(display_name, stable_agent_id)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const active = reservations?.filter((r: any) => r.status === 'active') ?? []
  const released = reservations?.filter((r: any) => r.status !== 'active') ?? []

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{project.repository_owner}/{project.repository_name}</Link>
      </header>
      <ProjectNav projectId={projectId} active="Files" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>File Reservations</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>
          Advisory warnings to help agents avoid conflicting file edits. Not a replacement for Git merge conflict resolution.
        </p>

        <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem' }}>Active ({active.length})</h2>
        {active.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '1.5rem' }}>No active reservations.</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-elevated)', fontSize: '12px', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Pattern</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Task</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Agent</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Expires</th>
              </tr></thead>
              <tbody>
                {active.map((r: any) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 1rem', fontFamily: 'monospace', fontSize: '13px', color: 'var(--yellow)' }}>{r.path_pattern}</td>
                    <td style={{ padding: '0.5rem 1rem', fontSize: '13px' }}>
                      {r.tasks ? <Link href={`/projects/${projectId}/tasks/${r.task_id}`} style={{ color: 'var(--accent)' }}>{r.tasks.display_id}</Link> : '—'}
                    </td>
                    <td style={{ padding: '0.5rem 1rem', fontSize: '13px', color: 'var(--text-muted)' }}>
                      {r.agents?.display_name ?? r.agents?.stable_agent_id ?? '—'}
                    </td>
                    <td style={{ padding: '0.5rem 1rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {r.expires_at ? new Date(r.expires_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem' }}>Released / Expired ({released.length})</h2>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg-elevated)', fontSize: '12px', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Pattern</th>
              <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '0.5rem 1rem', textAlign: 'left' }}>Task</th>
            </tr></thead>
            <tbody>
              {released.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>None</td></tr>
              ) : released.map((r: any) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 1rem', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-muted)' }}>{r.path_pattern}</td>
                  <td style={{ padding: '0.5rem 1rem' }}><StatusBadge status={r.status} size="sm" /></td>
                  <td style={{ padding: '0.5rem 1rem', fontSize: '13px' }}>
                    {r.tasks ? <Link href={`/projects/${projectId}/tasks/${r.task_id}`} style={{ color: 'var(--accent)' }}>{r.tasks.display_id}</Link> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
