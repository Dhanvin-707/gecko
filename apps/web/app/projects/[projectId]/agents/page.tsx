import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectNav } from '@/components/ProjectNav'
import { StatusBadge } from '@/components/StatusBadge'

type Params = { params: Promise<{ projectId: string }> }

export default async function AgentsPage({ params }: Params) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin.from('users').select('id').eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10)).single()
  if (!dbUser) redirect('/auth')

  const { data: project } = await admin.from('projects').select('id, repository_owner, repository_name').eq('id', projectId).eq('owner_id', dbUser.id).single()
  if (!project) redirect('/projects')

  const { data: agents } = await admin
    .from('agents')
    .select('*, tasks(display_id, title, status)')
    .eq('project_id', projectId)
    .order('last_seen_at', { ascending: false })

  function heartbeatAge(ts: string | null) {
    if (!ts) return '—'
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return `${Math.floor(diff / 3600000)}h ago`
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/projects" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>← Projects</Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <Link href={`/projects/${projectId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{project.repository_owner}/{project.repository_name}</Link>
      </header>
      <ProjectNav projectId={projectId} active="Agents" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Agents ({agents?.length ?? 0})</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {!agents?.length ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
              No agents registered. Use the CLI to register an agent.
            </div>
          ) : agents.map((a: any) => (
            <div key={a.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <StatusBadge status={a.status} />
                <span style={{ fontWeight: 600 }}>{a.display_name ?? a.stable_agent_id}</span>
                {a.provider_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.provider_name}</span>}
                {a.model_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.model_name}</span>}
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Last seen {heartbeatAge(a.last_heartbeat_at)}
                </span>
              </div>
              {a.tasks && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Current task: <Link href={`/projects/${projectId}/tasks/${a.current_task_id}`} style={{ color: 'var(--accent)' }}>{a.tasks.display_id} — {a.tasks.title}</Link>
                  <StatusBadge status={a.tasks.status} size="sm" />
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                ID: {a.stable_agent_id}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
