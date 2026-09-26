import { describe, it, expect } from 'vitest'
import {
  parseRepositoryUrl,
  redactSecrets,
  isAllowedTransition,
  TaskStatusSchema,
  GeckoEventSchema,
  ClaimTaskRequestSchema,
} from '@gecko/protocol'

describe('parseRepositoryUrl', () => {
  it('parses a valid GitHub URL', () => {
    const result = parseRepositoryUrl('https://github.com/octocat/hello-world')
    expect(result).toEqual({ owner: 'octocat', name: 'hello-world' })
  })

  it('handles .git suffix', () => {
    const result = parseRepositoryUrl('https://github.com/octocat/hello-world.git')
    expect(result).toEqual({ owner: 'octocat', name: 'hello-world' })
  })

  it('returns null for non-GitHub URLs', () => {
    expect(parseRepositoryUrl('https://gitlab.com/foo/bar')).toBeNull()
  })

  it('returns null for incomplete paths', () => {
    expect(parseRepositoryUrl('https://github.com/octocat')).toBeNull()
  })

  it('returns null for invalid URLs', () => {
    expect(parseRepositoryUrl('not-a-url')).toBeNull()
  })
})

describe('redactSecrets', () => {
  it('redacts keys containing secret-like names', () => {
    const result = redactSecrets({ api_key: 'abc123', normal_field: 'ok' })
    expect(result.api_key).toBe('[REDACTED]')
    expect(result.normal_field).toBe('ok')
  })

  it('redacts the whole value when the key itself is a secret name', () => {
    // 'auth' matches SECRET_KEYS so the whole object is redacted, not recursed into
    const result = redactSecrets({ auth: { token: 'secret', name: 'hello' } })
    expect(result.auth).toBe('[REDACTED]')
  })

  it('redacts nested secret fields under non-secret parent keys', () => {
    const result = redactSecrets({ metadata: { api_key: 'secret', label: 'hello' } })
    expect((result.metadata as any).api_key).toBe('[REDACTED]')
    expect((result.metadata as any).label).toBe('hello')
  })

  it('does not redact non-secret fields', () => {
    const result = redactSecrets({ event_type: 'task.claimed', task_id: 'abc' })
    expect(result.event_type).toBe('task.claimed')
    expect(result.task_id).toBe('abc')
  })
})

describe('isAllowedTransition', () => {
  it('allows ready → claimed', () => {
    expect(isAllowedTransition('ready', 'claimed')).toBe(true)
  })

  it('allows in_progress → failed', () => {
    expect(isAllowedTransition('in_progress', 'failed')).toBe(true)
  })

  it('disallows completed → in_progress', () => {
    expect(isAllowedTransition('completed', 'in_progress')).toBe(false)
  })

  it('disallows draft → in_progress directly', () => {
    expect(isAllowedTransition('draft', 'in_progress')).toBe(false)
  })

  it('allows stale → requeued', () => {
    expect(isAllowedTransition('stale', 'requeued')).toBe(true)
  })
})

describe('TaskStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'draft', 'ready', 'claimed', 'in_progress', 'testing',
      'blocked', 'failed', 'stale', 'requeued', 'review', 'completed', 'cancelled',
    ]
    for (const s of statuses) {
      expect(() => TaskStatusSchema.parse(s)).not.toThrow()
    }
  })

  it('rejects invalid status', () => {
    expect(() => TaskStatusSchema.parse('running')).toThrow()
  })
})

describe('ClaimTaskRequestSchema', () => {
  it('validates a valid claim request', () => {
    const result = ClaimTaskRequestSchema.safeParse({
      agent_id: '00000000-0000-0000-0000-000000000001',
      lease_seconds: 300,
    })
    expect(result.success).toBe(true)
  })

  it('rejects lease_seconds below minimum', () => {
    const result = ClaimTaskRequestSchema.safeParse({
      agent_id: '00000000-0000-0000-0000-000000000001',
      lease_seconds: 5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid agent_id', () => {
    const result = ClaimTaskRequestSchema.safeParse({
      agent_id: 'not-a-uuid',
      lease_seconds: 300,
    })
    expect(result.success).toBe(false)
  })
})

describe('GeckoEventSchema', () => {
  it('validates a complete event', () => {
    const event = {
      id: 'evt_001',
      sequence_number: 1,
      event_type: 'task.claimed',
      project_id: 'proj-1',
      task_id: 'task-1',
      agent_id: 'agent-1',
      claim_id: 'claim-1',
      actor_type: 'agent',
      payload: { claim_id: 'claim-1' },
      created_at: '2025-01-01T00:00:00Z',
    }
    expect(() => GeckoEventSchema.parse(event)).not.toThrow()
  })

  it('rejects unknown event_type', () => {
    const event = {
      id: 'evt_001',
      sequence_number: 1,
      event_type: 'unknown.event',
      project_id: 'proj-1',
      actor_type: 'system',
      payload: {},
      created_at: '2025-01-01T00:00:00Z',
    }
    expect(() => GeckoEventSchema.parse(event)).toThrow()
  })
})
