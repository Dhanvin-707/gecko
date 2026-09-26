import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SignOutButton } from '@/components/SignOutButton'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: dbUser } = await admin
    .from('users')
    .select('id, display_name, github_login, avatar_url')
    .eq('github_user_id', parseInt(user.user_metadata?.provider_id ?? '0', 10))
    .single()

  const { data: projects } = dbUser
    ? await admin
        .from('projects')
        .select('*')
        .eq('owner_id', dbUser.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <Link href="/" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          🦎 Gecko
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {dbUser?.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dbUser.avatar_url}
              alt={dbUser.github_login}
              style={{ width: 28, height: 28, borderRadius: '50%' }}
            />
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {dbUser?.display_name ?? dbUser?.github_login}
          </span>
          <SignOutButton />
        </div>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Projects</h1>
          <Link href="/projects/new" className="btn btn--primary">
            + New Project
          </Link>
        </div>

        {!projects?.length ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-muted)',
            }}
          >
            <p style={{ marginBottom: '1rem' }}>No projects yet.</p>
            <Link href="/projects/new" className="btn btn--primary">
              Connect a GitHub repository
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {projects.map((p: any) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                style={{
                  display: 'block',
                  padding: '1rem 1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {p.repository_owner}/{p.repository_name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {p.repository_url} · {p.default_branch} · {p.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
