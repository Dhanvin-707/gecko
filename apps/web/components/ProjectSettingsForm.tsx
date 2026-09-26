'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  project: { id: string; default_branch: string }
}

export function ProjectSettingsForm({ project }: Props) {
  const router = useRouter()
  const [branch, setBranch] = useState(project.default_branch)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_branch: branch }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to save')
      } else {
        setSaved(true)
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={save} style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Default branch</label>
      <input
        type="text"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        style={{ width: '160px' }}
        required
      />
      <button type="submit" className="btn btn--sm btn--primary" disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </button>
      {saved && <span style={{ fontSize: '12px', color: 'var(--green)' }}>Saved</span>}
      {error && <span style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</span>}
    </form>
  )
}
