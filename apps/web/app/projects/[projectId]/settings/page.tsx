import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { ProjectSettingsForm } from '@/components/ProjectSettingsForm'
import { getRepoMetadata, getRecentCommits } from '@/lib/github'

type Params = { params: Promise<{ projectId: string }> }

export default async function SettingsPage({ params }: Params) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin.from('users').select('id').eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10)).single()
  if (!dbUser) redirect('/auth')

  const { data: project } = await admin.from('projects').select('*').eq('id', projectId).eq('owner_id', dbUser.id).single()
  if (!project) redirect('/projects')

  let commits: any[] = []
  try {
    commits = await getRecentCommits(project.repository_owner, project.repository_name, project.default_branch)
  } catch { /* non-fatal */ }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{project.repository_owner}/{project.repository_name}</Link>
      </header>
      <ProjectNav projectId={projectId} active="Settings" />
      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem' }}>Project Settings</h1>

        <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '1rem' }}>Repository</h2>
          <div style={{ fontSize: '13px', lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>URL:</span>{' '}
              <a href={project.repository_url} target="_blank" rel="noopener noreferrer">{project.repository_url}</a>
            </div>
            <div><span style={{ color: 'var(--text-muted)' }}>Default branch:</span>{' '}<strong>{project.default_branch}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Status:</span>{' '}<strong>{project.status}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Created:</span>{' '}{new Date(project.created_at).toLocaleString()}</div>
          </div>
          <ProjectSettingsForm project={project} />
        </section>

        {/* Recent commits */}
        {commits.length > 0 && (
          <section style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.75rem' }}>Recent Commits</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {commits.map((c: any) => (
                <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', gap: '0.75rem', fontSize: '12px', color: 'var(--text)', textDecoration: 'none', padding: '0.4rem 0' }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--accent)', flexShrink: 0 }}>{c.sha.slice(0, 7)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message}</span>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{c.author}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
