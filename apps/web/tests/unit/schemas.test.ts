import { describe, it, expect } from 'vitest'
import {
  EventCursorQuerySchema,
  RegisterAgentRequestSchema,
  CreateProjectRequestSchema,
  CreateTaskRequestSchema,
  RequeueTaskRequestSchema,
  CheckpointRequestSchema,
  ReservationRequestSchema,
  CompleteTaskRequestSchema,
} from '@gecko/protocol'

describe('EventCursorQuerySchema', () => {
  it('coerces string after_sequence', () => {
    const result = EventCursorQuerySchema.safeParse({ after_sequence: '50' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.after_sequence).toBe(50)
  })

  it('defaults after_sequence to 0', () => {
    const result = EventCursorQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.after_sequence).toBe(0)
  })

  it('caps limit at 500', () => {
    const result = EventCursorQuerySchema.safeParse({ limit: '1000' })
    expect(result.success).toBe(false)
  })
})

describe('RegisterAgentRequestSchema', () => {
  it('validates a valid registration', () => {
    const result = RegisterAgentRequestSchema.safeParse({
      project_id: '00000000-0000-0000-0000-000000000001',
      stable_agent_id: 'agent-laptop-1',
      provider_name: 'ibm-bob',
      model_name: 'granite',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing project_id', () => {
    const result = RegisterAgentRequestSchema.safeParse({ stable_agent_id: 'agent-1' })
    expect(result.success).toBe(false)
  })
})

describe('CreateProjectRequestSchema', () => {
  it('accepts a valid URL', () => {
    const result = CreateProjectRequestSchema.safeParse({
      repository_url: 'https://github.com/owner/repo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-URLs', () => {
    const result = CreateProjectRequestSchema.safeParse({ repository_url: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

describe('CreateTaskRequestSchema', () => {
  it('creates a minimal task', () => {
    const result = CreateTaskRequestSchema.safeParse({ title: 'Implement feature' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.priority).toBe(50)
  })

  it('rejects empty title', () => {
    const result = CreateTaskRequestSchema.safeParse({ title: '' })
    expect(result.success).toBe(false)
  })
})

describe('CheckpointRequestSchema', () => {
  it('accepts valid checkpoint', () => {
    const result = CheckpointRequestSchema.safeParse({
      claim_id: 'claim-123',
      message: 'Implemented the login flow',
    })
    expect(result.success).toBe(true)
  })

  it('rejects message over 1024 chars', () => {
    const result = CheckpointRequestSchema.safeParse({
      claim_id: 'claim-123',
      message: 'x'.repeat(1025),
    })
    expect(result.success).toBe(false)
  })
})

describe('ReservationRequestSchema', () => {
  it('validates a file pattern', () => {
    const result = ReservationRequestSchema.safeParse({
      claim_id: 'claim-123',
      path_pattern: 'src/auth/**',
    })
    expect(result.success).toBe(true)
  })
})

describe('CompleteTaskRequestSchema', () => {
  it('accepts minimal completion', () => {
    const result = CompleteTaskRequestSchema.safeParse({ claim_id: 'claim-123' })
    expect(result.success).toBe(true)
  })

  it('validates pr_url is a URL', () => {
    const result = CompleteTaskRequestSchema.safeParse({
      claim_id: 'claim-123',
      pr_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })
})
