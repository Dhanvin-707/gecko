'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Task {
  id: string
  status: string
  claim_id: string | null
  display_id: string
}

interface Props {
  task: Task
  projectId: string
}

export function TaskDetailActions({ task, projectId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function perform(action: string, body: Record<string, unknown> = {}) {
    setLoading(action)
    setError('')
    try {
      const url = action === 'requeue' || action === 'release'
        ? `/api/tasks/${task.id}/${action}`
        : action === 'cancel'
        ? `/api/tasks/${task.id}`
        : `/api/tasks/${task.id}/${action}`

      const method = action === 'cancel' ? 'DELETE' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Action failed')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  const canRelease = ['claimed', 'in_progress', 'testing', 'blocked'].includes(task.status) && task.claim_id
  const canRequeue = ['failed', 'stale', 'blocked', 'in_progress'].includes(task.status)
  const canCancel = !['completed', 'cancelled'].includes(task.status)
  const canSetReady = task.status === 'draft'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
      {canSetReady && (
        <button
          className="btn btn--primary btn--sm"
          onClick={() => perform('ready', {})}
          disabled={!!loading}
        >
          Mark Ready
        </button>
      )}
      {canRelease && (
        <button
          className="btn btn--sm"
          onClick={() => perform('release', { claim_id: task.claim_id })}
          disabled={!!loading}
        >
          Release Task
        </button>
      )}
      {canRequeue && (
        <button
          className="btn btn--sm"
          onClick={() => {
            const reason = prompt('Reason for requeueing?')
            if (reason) perform('requeue', { claim_id: task.claim_id, reason })
          }}
          disabled={!!loading}
        >
          Requeue
        </button>
      )}
      {canCancel && (
        <button
          className="btn btn--danger btn--sm"
          onClick={() => {
            if (confirm(`Cancel task ${task.display_id}? This cannot be undone.`)) {
              perform('cancel')
            }
          }}
          disabled={!!loading}
        >
          Cancel Task
        </button>
      )}
      {error && <p style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}
