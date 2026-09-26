import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'

type Params = { params: Promise<{ projectId: string }>; searchParams: Promise<{ after?: string; limit?: string }> }

export default async function EventsPage({ params, searchParams }: Params) {
  const { projectId } = await params
  const { after = '0', limit = '100' } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin.from('users').select('id').eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10)).single()
  if (!dbUser) redirect('/auth')

  const { data: project } = await admin.from('projects').select('id, repository_owner, repository_name').eq('id', projectId).eq('owner_id', dbUser.id).single()
  if (!project) redirect('/projects')

  const afterSeq = parseInt(after, 10) || 0
  const pageLimit = Math.min(parseInt(limit, 10) || 100, 500)

  const { data: events } = await admin
    .from('events')
    .select('*, tasks(display_id), agents(display_name, stable_agent_id)')
    .eq('project_id', projectId)
    .gt('sequence_number', afterSeq)
    .order('sequence_number', { ascending: false })
    .limit(pageLimit)

  const oldest = events?.[events.length - 1]?.sequence_number ?? 0

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{project.repository_owner}/{project.repository_name}</Link>
      </header>
      <ProjectNav projectId={projectId} active="Events" />
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>GECKOLOG Event Stream</h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{events?.length ?? 0} events shown</span>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: '60px' }}>#</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: '200px' }}>Event Type</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: '90px' }}>Task</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Agent</th>
                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', width: '170px' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {!events?.length ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'sans-serif' }}>No events</td></tr>
              ) : events.map((e: any) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>{e.sequence_number}</td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--accent)' }}>{e.event_type}</td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>
                    {e.tasks ? (
                      <Link href={`/projects/${projectId}/tasks/${e.task_id}`} style={{ color: 'var(--accent)' }}>
                        {e.tasks.display_id}
                      </Link>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>
                    {e.agents?.display_name ?? e.agents?.stable_agent_id ?? '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {events && events.length >= pageLimit && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link href={`/projects/${projectId}/events?after=${oldest - 1}&limit=${pageLimit}`} className="btn btn--sm">
              Load older events
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
