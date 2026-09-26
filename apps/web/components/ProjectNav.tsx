import Link from 'next/link'

interface NavItem {
  href: string
  label: string
}

interface Props {
  projectId: string
  active?: string
}

const navItems = (pid: string): NavItem[] => [
  { href: `/projects/${pid}`, label: 'Dashboard' },
  { href: `/projects/${pid}/plan`, label: 'Plan' },
  { href: `/projects/${pid}/tasks`, label: 'Tasks' },
  { href: `/projects/${pid}/agents`, label: 'Agents' },
  { href: `/projects/${pid}/files`, label: 'Files' },
  { href: `/projects/${pid}/events`, label: 'Events' },
  { href: `/projects/${pid}/pull-requests`, label: 'Pull Requests' },
  { href: `/projects/${pid}/settings`, label: 'Settings' },
]

export function ProjectNav({ projectId, active }: Props) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: '0.25rem',
        padding: '0 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        overflowX: 'auto',
        flexWrap: 'nowrap',
      }}
    >
      {navItems(projectId).map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          style={{
            padding: '0.65rem 0.85rem',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            color: active === label ? 'var(--text)' : 'var(--text-muted)',
            borderBottom: active === label ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: active === label ? 600 : 400,
            textDecoration: 'none',
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
