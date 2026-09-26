'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  planId: string
  projectId: string
}

export function PlanApproveButton({ planId, projectId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function approve() {
    if (!confirm('Approve this plan? All draft tasks will become ready for claiming.')) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to approve plan')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button className="btn btn--primary" onClick={approve} disabled={loading}>
        {loading ? 'Approving…' : 'Approve Plan'}
      </button>
      {error && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '0.25rem' }}>{error}</p>}
    </div>
  )
}
