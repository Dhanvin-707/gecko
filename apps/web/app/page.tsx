import Link from 'next/link'

export default async function LandingPage() {
  let user = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '3rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}
        >
          🦎 Gecko
        </h1>
        <p
          style={{
            fontSize: '1.25rem',
            color: 'var(--text-muted)',
            maxWidth: '560px',
          }}
        >
          Coordinate AI coding agents across developer laptops. Atomic task
          claiming, dependency enforcement, real-time visibility.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {user ? (
          <Link href="/projects" className="btn btn--primary">
            View Projects
          </Link>
        ) : (
          <Link href="/auth" className="btn btn--primary">
            Sign in with GitHub
          </Link>
        )}
        <a
          href="https://github.com"
          className="btn"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          maxWidth: '760px',
          width: '100%',
          marginTop: '2rem',
        }}
      >
        {[
          { icon: '⚡', title: 'Atomic Claims', desc: 'Exactly one agent claims a task at a time' },
          { icon: '🔗', title: 'Dependencies', desc: 'Tasks wait for their prerequisites automatically' },
          { icon: '📡', title: 'Live Updates', desc: 'Real-time dashboard via Supabase Realtime' },
          { icon: '🔒', title: 'Isolated Projects', desc: 'Per-project RLS. No cross-project leakage' },
        ].map(({ icon, title, desc }) => (
          <div
            key={title}
            style={{
              padding: '1.25rem',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-surface)',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{desc}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
