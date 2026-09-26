import { z } from 'zod'

// ─── Shared primitives ────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum([
  'draft',
  'ready',
  'claimed',
  'in_progress',
  'testing',
  'blocked',
  'failed',
  'stale',
  'requeued',
  'review',
  'completed',
  'cancelled',
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const AgentStatusSchema = z.enum([
  'offline',
  'online',
  'idle',
  'planning',
  'coding',
  'testing',
  'blocked',
  'review',
  'failed',
])
export type AgentStatus = z.infer<typeof AgentStatusSchema>

export const PlanStatusSchema = z.enum(['draft', 'approved', 'superseded'])
export type PlanStatus = z.infer<typeof PlanStatusSchema>

export const ClaimStatusSchema = z.enum([
  'active',
  'released',
  'expired',
  'completed',
  'rejected',
])
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>

export const ReservationStatusSchema = z.enum(['active', 'released', 'expired'])
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>

export const ActorTypeSchema = z.enum(['agent', 'user', 'system'])
export type ActorType = z.infer<typeof ActorTypeSchema>

// ─── Event payload schemas ────────────────────────────────────────────────────

export const ProjectCreatedPayloadSchema = z.object({
  repository_url: z.string().url(),
  repository_owner: z.string(),
  repository_name: z.string(),
})

export const PlanGeneratedPayloadSchema = z.object({
  plan_id: z.string(),
  version: z.number().int().positive(),
  goal: z.string().optional(),
  generated_by: z.string().optional(),
})

export const PlanApprovedPayloadSchema = z.object({
  plan_id: z.string(),
  approved_by: z.string(),
})

export const AgentConnectedPayloadSchema = z.object({
  stable_agent_id: z.string(),
  display_name: z.string().optional(),
  provider_name: z.string().optional(),
  model_name: z.string().optional(),
  capabilities: z.record(z.unknown()).optional(),
})

export const AgentHeartbeatPayloadSchema = z.object({
  current_task_id: z.string().nullable().optional(),
  status: AgentStatusSchema.optional(),
})

export const AgentDisconnectedPayloadSchema = z.object({
  reason: z.string().optional(),
})

export const TaskCreatedPayloadSchema = z.object({
  display_id: z.string(),
  title: z.string(),
  plan_id: z.string().optional(),
})

export const TaskClaimedPayloadSchema = z.object({
  claim_id: z.string(),
  lease_expires_at: z.string().datetime(),
  attempt_number: z.number().int(),
})

export const TaskClaimRejectedPayloadSchema = z.object({
  reason: z.enum([
    'already_claimed',
    'not_ready',
    'dependencies_incomplete',
    'task_not_found',
    'unauthorized',
  ]),
  current_owner: z.string().nullable().optional(),
})

export const TaskStartedPayloadSchema = z.object({
  claim_id: z.string(),
})

export const TaskCheckpointPayloadSchema = z.object({
  claim_id: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
})

export const TaskBlockedPayloadSchema = z.object({
  claim_id: z.string(),
  reason: z.string(),
})

export const TaskFailedPayloadSchema = z.object({
  claim_id: z.string(),
  reason: z.string(),
  error: z.string().optional(),
})

export const TaskStalePayloadSchema = z.object({
  claim_id: z.string(),
  lease_expired_at: z.string().datetime(),
})

export const TaskRequeuedPayloadSchema = z.object({
  previous_claim_id: z.string(),
  reason: z.string(),
  attempt_number: z.number().int(),
})

export const TaskCompletedPayloadSchema = z.object({
  claim_id: z.string(),
  branch_name: z.string().optional(),
  pr_number: z.number().int().optional(),
  pr_url: z.string().url().optional(),
})

export const TaskCancelledPayloadSchema = z.object({
  reason: z.string().optional(),
  cancelled_by: z.string().optional(),
})

export const FileReservedPayloadSchema = z.object({
  claim_id: z.string(),
  path_pattern: z.string(),
  reservation_id: z.string(),
})

export const FileReleasedPayloadSchema = z.object({
  claim_id: z.string(),
  reservation_id: z.string(),
})

export const VerificationStartedPayloadSchema = z.object({
  claim_id: z.string(),
  commands: z.array(z.string()).optional(),
})

export const VerificationCompletedPayloadSchema = z.object({
  claim_id: z.string(),
  passed: z.boolean(),
  output: z.string().optional(),
})

export const PullRequestCreatedPayloadSchema = z.object({
  claim_id: z.string(),
  github_pr_number: z.number().int(),
  github_url: z.string().url(),
  branch_name: z.string(),
})

export const PullRequestUpdatedPayloadSchema = z.object({
  github_pr_number: z.number().int(),
  status: z.string(),
  checks_status: z.string().optional(),
})

// ─── Event type union ─────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'project.created',
  'plan.generated',
  'plan.approved',
  'agent.connected',
  'agent.heartbeat',
  'agent.disconnected',
  'task.created',
  'task.claimed',
  'task.claim_rejected',
  'task.started',
  'task.checkpoint',
  'task.blocked',
  'task.failed',
  'task.stale',
  'task.requeued',
  'task.completed',
  'task.cancelled',
  'file.reserved',
  'file.released',
  'verification.started',
  'verification.completed',
  'pull_request.created',
  'pull_request.updated',
] as const

export const EventTypeSchema = z.enum(EVENT_TYPES)
export type EventType = z.infer<typeof EventTypeSchema>

export const GeckoEventSchema = z.object({
  id: z.string(),
  sequence_number: z.number().int().nonnegative(),
  event_type: EventTypeSchema,
  project_id: z.string(),
  task_id: z.string().nullable().optional(),
  agent_id: z.string().nullable().optional(),
  claim_id: z.string().nullable().optional(),
  actor_type: ActorTypeSchema,
  payload: z.record(z.unknown()),
  created_at: z.string().datetime(),
})
export type GeckoEvent = z.infer<typeof GeckoEventSchema>

// ─── API request/response schemas ─────────────────────────────────────────────

export const RegisterAgentRequestSchema = z.object({
  project_id: z.string().uuid(),
  stable_agent_id: z.string().min(1).max(128),
  display_name: z.string().max(128).optional(),
  provider_name: z.string().max(64).optional(),
  model_name: z.string().max(128).optional(),
  capabilities: z.record(z.unknown()).optional(),
})
export type RegisterAgentRequest = z.infer<typeof RegisterAgentRequestSchema>

export const HeartbeatRequestSchema = z.object({
  claim_id: z.string().nullable().optional(),
  current_task_id: z.string().nullable().optional(),
  status: AgentStatusSchema.optional(),
})
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>

export const ClaimTaskRequestSchema = z.object({
  agent_id: z.string().uuid(),
  requested_claim_id: z.string().min(1).max(128).optional(),
  lease_seconds: z.number().int().min(30).max(3600).default(300),
  expected_task_version: z.number().int().optional(),
})
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequestSchema>

export const ClaimTaskResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    task_id: z.string(),
    claim_id: z.string(),
    lease_expires_at: z.string().datetime(),
  }),
  z.object({
    success: z.literal(false),
    reason: z.string(),
    owner_agent_id: z.string().nullable().optional(),
    current_task_status: TaskStatusSchema.optional(),
  }),
])
export type ClaimTaskResponse = z.infer<typeof ClaimTaskResponseSchema>

export const ReleaseTaskRequestSchema = z.object({
  claim_id: z.string(),
  reason: z.string().optional(),
})
export type ReleaseTaskRequest = z.infer<typeof ReleaseTaskRequestSchema>

export const RequeueTaskRequestSchema = z.object({
  claim_id: z.string(),
  reason: z.string(),
})
export type RequeueTaskRequest = z.infer<typeof RequeueTaskRequestSchema>

export const CheckpointRequestSchema = z.object({
  claim_id: z.string(),
  message: z.string().max(1024),
  metadata: z.record(z.unknown()).optional(),
})
export type CheckpointRequest = z.infer<typeof CheckpointRequestSchema>

export const ReservationRequestSchema = z.object({
  claim_id: z.string(),
  path_pattern: z.string().min(1).max(512),
})
export type ReservationRequest = z.infer<typeof ReservationRequestSchema>

export const CompleteTaskRequestSchema = z.object({
  claim_id: z.string(),
  branch_name: z.string().optional(),
  pr_number: z.number().int().optional(),
  pr_url: z.string().url().optional(),
})
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequestSchema>

export const CreateProjectRequestSchema = z.object({
  repository_url: z.string().url(),
  default_branch: z.string().default('main'),
})
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

export const CreateTaskRequestSchema = z.object({
  plan_id: z.string().uuid().optional(),
  display_id: z.string().max(32).optional(),
  title: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  expected_files: z.array(z.string()).optional(),
  verification_commands: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  depends_on: z.array(z.string()).optional(),
})
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>

export const UpdateTaskRequestSchema = CreateTaskRequestSchema.partial().omit({
  plan_id: true,
})
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>

export const CreatePlanRequestSchema = z.object({
  version: z.number().int().positive().optional(),
  source_file: z.string().optional(),
  goal: z.string().max(2048).optional(),
  generated_by: z.string().max(128).optional(),
  tasks: z.array(CreateTaskRequestSchema).optional(),
})
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>

export const EventCursorQuerySchema = z.object({
  after_sequence: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})
export type EventCursorQuery = z.infer<typeof EventCursorQuerySchema>

export const AckEventRequestSchema = z.object({
  last_sequence: z.number().int().nonnegative(),
})
export type AckEventRequest = z.infer<typeof AckEventRequestSchema>

// ─── Task state machine ───────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'stale', 'cancelled', 'ready'],
  in_progress: ['testing', 'blocked', 'failed', 'stale', 'requeued', 'review'],
  testing: ['in_progress', 'failed', 'stale', 'requeued', 'review'],
  blocked: ['in_progress', 'requeued', 'cancelled'],
  failed: ['requeued', 'cancelled'],
  stale: ['requeued', 'cancelled'],
  requeued: ['claimed', 'cancelled'],
  review: ['completed', 'requeued', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function isAllowedTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────

export function parseRepositoryUrl(url: string): {
  owner: string
  name: string
} | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return null
    const parts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
    if (parts.length < 2) return null
    return { owner: parts[0], name: parts[1] }
  } catch {
    return null
  }
}

// ─── Secret redaction ─────────────────────────────────────────────────────────

const SECRET_KEYS = /\b(key|secret|token|password|credential|auth|api_key|apikey|private)\b/i

export function redactSecrets(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = '[REDACTED]'
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSecrets(v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}
