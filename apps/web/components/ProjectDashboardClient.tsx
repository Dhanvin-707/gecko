'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/StatusBadge'

interface Task {
  id: string
  display_id: string
  title: string
  status: string
  priority: number
  assigned_agent_id: string | null
  attempt_number: number
}

interface Agent {
  id: string
  display_name: string | null
  stable_agent_id: string
  status: string
  current_task_id: string | null
  last_heartbeat_at: string | null
}

interface Plan {
  id: string
  version: number
  status: string
  goal: string | null
}

interface EventRow {
  id: string
  sequence_number: number
  event_type: string
  task_id: string | null
  agent_id: string | null
  created_at: string
}

interface PR {
  id: string
  github_pr_number: number
  github_url: string
  branch_name: string
  status: string
  task_id: string | null
}

interface Reservation {
  id: string
  path_pattern: string
  status: string
  task_id: string | null
  agent_id: string | null
  expires_at: string
}

interface Props {
  project: {
    id: string
    repository_owner: string
    repository_name: string
    default_branch: string
    repository_url: string
  }
  initialTasks: Task[]
  initialAgents: Agent[]
  initialPlan: Plan | null
  initialEvents: EventRow[]
  initialPRs: PR[]
  initialReservations: Reservation[]
}

const STATUS_ORDER = [
  'failed', 'stale', 'blocked', 'in_progress', 'testing',
  'claimed', 'review', 'requeued', 'ready', 'draft', 'completed', 'cancelled',
]

function countByStatus(tasks: Task[]) {
  const counts: Record<string, number> = {}
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1
  return counts
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

export function ProjectDashboardClient({
  project,
  initialTasks,
  initialAgents,
  initialPlan,
  initialEvents,
  initialPRs,
  initialReservations,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [plan, setPlan] = useState<Plan | null>(initialPlan)
  const [events, setEvents] = useState<EventRow[]>(initialEvents)
  const [prs, setPRs] = useState<PR[]>(initialPRs)
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'polling'>('connecting')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Realtime subscriptions ───────────────────────────────────────────────

  const refreshTasks = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/tasks`)
    if (res.ok) {
      const data = await res.json()
      setTasks(data)
    }
  }, [project.id])

  const refreshAgents = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('agents')
      .select('id, display_name, stable_agent_id, status, current_task_id, last_heartbeat_at')
      .eq('project_id', project.id)
      .order('last_seen_at', { ascending: false })
    if (data) setAgents(data)
  }, [project.id])

  const refreshEvents = useCallback(async () => {
    const last = events[0]?.sequence_number ?? 0
    const supabase = createClient()
    const { data } = await supabase
      .from('events')
      .select('id, sequence_number, event_type, task_id, agent_id, created_at')
      .eq('project_id', project.id)
      .order('sequence_number', { ascending: false })
      .limit(20)
    if (data) setEvents(data)
  }, [project.id, events])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`project:${project.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${project.id}`,
      }, () => { refreshTasks() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents',
        filter: `project_id=eq.${project.id}`,
      }, () => { refreshAgents() })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: `project_id=eq.${project.id}`,
      }, (payload) => {
        setEvents((prev) => [payload.new as EventRow, ...prev].slice(0, 20))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected')
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('polling')
          startPolling()
        }
      })

    function startPolling() {
      pollRef.current = setInterval(() => {
        refreshTasks()
        refreshAgents()
        refreshEvents()
      }, 10000)
    }

    // Start a polling fallback after 5 seconds if realtime hasn't connected
    const connectTimeout = setTimeout(() => {
      if (realtimeStatus === 'connecting') {
        setRealtimeStatus('polling')
        startPolling()
      }
    }, 5000)

    return () => {
      clearTimeout(connectTimeout)
      if (pollRef.current) clearInterval(pollRef.current)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const counts = countByStatus(tasks)
  const activeTasks = tasks.filter((t) => ['claimed', 'in_progress', 'testing', 'review'].includes(t.status))
  const problemTasks = tasks.filter((t) => ['failed', 'stale', 'blocked'].includes(t.status))

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Live indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.25rem',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: realtimeStatus === 'connected' ? 'var(--green)' : realtimeStatus === 'polling' ? 'var(--yellow)' : 'var(--text-muted)',
            display: 'inline-block',
          }}
        />
        {realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'polling' ? 'Polling (10s)' : 'Connecting…'}
        <a
          href={project.repository_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
        >
          {project.repository_owner}/{project.repository_name} ↗
        </a>
      </div>

      {/* Plan status */}
      {plan && (
        <div
          style={{
            padding: '0.875rem 1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>Plan v{plan.version}</span>
            <StatusBadge status={plan.status} size="sm" />
            {plan.goal && (
              <span style={{ marginLeft: '0.75rem', color: 'var(--text-muted)', fontSize: '13px' }}>
                {plan.goal}
              </span>
            )}
          </div>
          <Link
            href={`/projects/${project.id}/plan`}
            style={{ fontSize: '12px', color: 'var(--accent)' }}
          >
            View plan →
          </Link>
        </div>
      )}

      {/* Task counts */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1.25rem',
        }}
      >
        {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
          <Link
            key={s}
            href={`/projects/${project.id}/tasks?status=${s}`}
            style={{ textDecoration: 'none' }}
          >
            <span className={`badge badge--${s}`}>
              {s.replace(/_/g, ' ')} {counts[s]}
            </span>
          </Link>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Active tasks */}
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Active Tasks</span>
            <Link href={`/projects/${project.id}/tasks`} style={{ fontSize: '12px', fontWeight: 400 }}>
              View all →
            </Link>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {activeTasks.length === 0 ? (
              <p style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '13px' }}>No active tasks</p>
            ) : (
              activeTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${project.id}/tasks/${t.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {t.display_id}
                  </span>
                  <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </span>
                  <StatusBadge status={t.status} size="sm" />
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Agents */}
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Agents ({agents.length})</span>
            <Link href={`/projects/${project.id}/agents`} style={{ fontSize: '12px', fontWeight: 400 }}>
              View all →
            </Link>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {agents.length === 0 ? (
              <p style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '13px' }}>No agents registered</p>
            ) : (
              agents.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                  }}
                >
                  <StatusBadge status={a.status} size="sm" />
                  <span style={{ flex: 1, fontSize: '13px' }}>{a.display_name ?? a.stable_agent_id}</span>
                  {a.last_heartbeat_at && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {relativeTime(a.last_heartbeat_at)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Problem tasks */}
        {problemTasks.length > 0 && (
          <section
            style={{
              border: '1px solid var(--red)',
              borderRadius: 'var(--radius)',
              background: 'rgba(248,81,73,0.05)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--red)',
                fontWeight: 600,
                fontSize: '13px',
                color: 'var(--red)',
              }}
            >
              ⚠ Failed / Stale / Blocked ({problemTasks.length})
            </div>
            <div style={{ padding: '0.5rem' }}>
              {problemTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${project.id}/tasks/${t.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {t.display_id}
                  </span>
                  <span style={{ flex: 1, fontSize: '13px' }}>{t.title}</span>
                  <StatusBadge status={t.status} size="sm" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* File reservations */}
        {reservations.length > 0 && (
          <section
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>File Reservations</span>
              <Link href={`/projects/${project.id}/files`} style={{ fontSize: '12px', fontWeight: 400 }}>
                View all →
              </Link>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {reservations.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '0.4rem 0.75rem',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: 'var(--yellow)',
                  }}
                >
                  {r.path_pattern}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pull Requests */}
        {prs.length > 0 && (
          <section
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Open Pull Requests</span>
              <Link href={`/projects/${project.id}/pull-requests`} style={{ fontSize: '12px', fontWeight: 400 }}>
                View all →
              </Link>
            </div>
            <div style={{ padding: '0.5rem' }}>
              {prs.map((pr) => (
                <a
                  key={pr.id}
                  href={pr.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>#{pr.github_pr_number}</span>
                  <span style={{ flex: 1 }}>{pr.branch_name}</span>
                  <StatusBadge status={pr.status} size="sm" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Recent events */}
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-surface)',
            overflow: 'hidden',
            gridColumn: '1 / -1',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Recent Events</span>
            <Link href={`/projects/${project.id}/events`} style={{ fontSize: '12px', fontWeight: 400 }}>
              View all →
            </Link>
          </div>
          <div style={{ padding: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
            {events.length === 0 ? (
              <p style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '13px' }}>No events yet</p>
            ) : (
              events.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.35rem 0.75rem',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    borderBottom: '1px solid var(--bg-elevated)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>#{e.sequence_number}</span>
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{e.event_type}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                    {formatTime(e.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
