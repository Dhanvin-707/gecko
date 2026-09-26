import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { StatusBadge } from '@/components/StatusBadge'
import { getOpenPullRequests } from '@/lib/github'

type Params = { params: Promise<{ projectId: string }> }

export default async function PullRequestsPage({ params }: Params) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin.from('users').select('id').eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10)).single()
  if (!dbUser) redirect('/auth')

  const { data: project } = await admin.from('projects').select('*').eq('id', projectId).eq('owner_id', dbUser.id).single()
  if (!project) redirect('/projects')

  const { data: prs } = await admin
    .from('pull_requests')
    .select('*, tasks(display_id, title), agents(display_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  let githubPRs: any[] = []
  try {
    githubPRs = await getOpenPullRequests(project.repository_owner, project.repository_name)
  } catch { /* non-fatal */ }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{project.repository_owner}/{project.repository_name}</Link>
      </header>
      <ProjectNav projectId={projectId} active="Pull Requests" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem' }}>Pull Requests</h1>

        {/* GitHub live PRs */}
        {githubPRs.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>Open on GitHub ({githubPRs.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {githubPRs.map((pr: any) => (
                <a key={pr.number} href={pr.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)', color: 'var(--text)', textDecoration: 'none' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>#{pr.number}</span>
                  <span style={{ flex: 1, fontSize: '13px' }}>{pr.title}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pr.user}</span>
                  {pr.draft && <span className="badge">Draft</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Gecko-tracked PRs */}
        <section>
          <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>Gecko-Tracked PRs ({prs?.length ?? 0})</h2>
          {!prs?.length ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No PRs tracked yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {prs.map((pr: any) => (
                <div key={pr.id} style={{ padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <StatusBadge status={pr.status} size="sm" />
                    <a href={pr.github_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600 }}>
                      #{pr.github_pr_number} — {pr.branch_name}
                    </a>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {pr.tasks && (
                      <span>Task: <Link href={`/projects/${projectId}/tasks/${pr.task_id}`} style={{ color: 'var(--accent)' }}>{pr.tasks.display_id} — {pr.tasks.title}</Link> · </span>
                    )}
                    Agent: {pr.agents?.display_name ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
