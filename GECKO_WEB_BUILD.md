# Gecko Web Build Specification

## Instructions To The Bob IDE Agent

You are building the hosted coordination control plane for Gecko.

Do not build a generic project-management application. Build the web control plane for multiple AI coding agents working on the same Git repository from different laptops.

Implement the code, database migrations, tests, and documentation described in this file. Do not only describe a solution. Work in small, verifiable steps and keep the application runnable after every step.

The local CLI is being built by another developer. Treat the API and event contracts in this file as the source of truth. Do not invent incompatible request or response shapes.

## Product Definition

Gecko coordinates AI coding agents across different developer laptops.

The web application is responsible for:

- Projects and repository records
- User authentication
- Plans and task graphs
- Atomic task claims
- Prerequisite enforcement
- Agent registration and presence
- File reservations
- Heartbeats and leases
- Append-only event storage
- Real-time project state
- Pull request and verification display
- Human approval and override controls

The web application must not execute arbitrary repository code. The local Gecko CLI runs IBM Bob or another configured agent and sends events to this service.

## Required Stack

- Next.js with TypeScript and App Router
- Vercel deployment
- Supabase PostgreSQL
- Supabase Auth with GitHub login
- Supabase Realtime for live updates
- Zod for request validation
- Vitest for unit and API tests
- Playwright for browser tests
- Octokit for public GitHub API access

Do not add a separate backend server for the MVP. Use Next.js route handlers for short API requests and Supabase RPC functions for atomic database operations.

## Repository Structure

Create or preserve this structure:

```text
apps/web/
  app/
    page.tsx
    auth/
    projects/
    api/
  components/
  lib/
  styles/
  tests/
supabase/
  migrations/
packages/protocol/
  src/
```

If the repository does not have a monorepo yet, create a minimal pnpm workspace. Do not create a second unrelated application.

## MVP Scope

Support initially:

- GitHub public repositories
- One Gecko project per repository
- GitHub login
- Task planning records submitted by the CLI
- Manual task planning and editing in the website
- Agent registration from the CLI
- Atomic claims
- Task dependencies
- File reservation warnings
- Heartbeats
- Event history
- Live dashboard updates
- Pull request links
- Human approval and task release

Do not implement initially:

- Running shell commands on Vercel
- Executing repository code on the web server
- Storing IBM Bob API keys on the website
- Automatic merging
- Full private repository support
- Billing
- Multi-provider cloud workers

## Core Architecture

```text
GitHub repository
  plan.md, gecko.yml, source, branches, PRs
          |
          v
Gecko Web on Vercel
          |
          v
Supabase database and Realtime
          ^
          |
Gecko CLI on multiple developer laptops
          |
IBM Bob or another local provider
```

GitHub stores permanent code history. Supabase stores live coordination state. The web application displays the coordination state. The CLI executes code and agents locally.

## Environment Variables

Create `.env.example` with:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GECKO_PUBLIC_URL=http://localhost:3000
```

Do not add IBM Bob credentials to the website for this architecture. Provider keys belong to the local CLI and never enter GitHub, Supabase, browser JavaScript, or Vercel logs.

## Database Model

Create migrations for these tables. Use UUID primary keys unless a task identifier is required for display.

### users

```text
id
github_user_id
github_login
display_name
avatar_url
created_at
updated_at
```

### projects

```text
id
owner_id
repository_url
repository_owner
repository_name
default_branch
status
created_at
updated_at
```

### plans

```text
id
project_id
version
source_file
goal
status: draft | approved | superseded
generated_by
approved_by
approved_at
created_at
updated_at
```

### tasks

```text
id
project_id
plan_id
display_id
title
description
acceptance_criteria_json
expected_files_json
verification_commands_json
priority
risk
status: draft | ready | claimed | in_progress | testing | blocked | failed | stale | requeued | review | completed | cancelled
assigned_agent_id
claim_id
attempt_number
lease_expires_at
created_at
updated_at
```

### task_dependencies

```text
task_id
depends_on_task_id
created_at
```

Add a constraint preventing a task from depending on itself.

### agents

```text
id
project_id
stable_agent_id
display_name
provider_name
model_name
capabilities_json
status: offline | online | idle | planning | coding | testing | blocked | review | failed
current_task_id
last_heartbeat_at
connected_at
last_seen_at
created_at
updated_at
```

### task_claims

```text
id
task_id
agent_id
attempt_number
status: active | released | expired | completed | rejected
claimed_at
lease_expires_at
released_at
rejection_reason
```

Only one active claim may exist for a task. Enforce this with a partial unique index or an atomic Supabase RPC.

### file_reservations

```text
id
project_id
task_id
agent_id
path_pattern
status: active | released | expired
created_at
expires_at
```

Reservations are advisory warnings in the MVP. They are not a replacement for Git merge conflict handling.

### checkpoints

```text
id
project_id
task_id
agent_id
claim_id
message
metadata_json
created_at
```

### events

```text
id
project_id
sequence_number
event_type
task_id
agent_id
claim_id
actor_type
payload_json
created_at
```

`sequence_number` must be monotonically increasing per project. It is used by the CLI to synchronize the local GECKOLOG copy.

### pull_requests

```text
id
project_id
task_id
agent_id
github_pr_number
github_url
branch_name
status
checks_status
created_at
updated_at
```

## Atomic Task Claiming

Implement a Supabase RPC function named `claim_task`.

Inputs:

```text
project_id
task_id
agent_id
requested_claim_id
lease_seconds
expected_task_version
```

The transaction must:

1. Lock the task row.
2. Confirm the task exists in the project.
3. Confirm the task is `ready` or `requeued`.
4. Confirm every dependency is `completed`.
5. Confirm no active non-expired claim exists.
6. Expire stale claims if their lease has elapsed.
7. Create the claim.
8. Set the task to `claimed`.
9. Set `assigned_agent_id`, `claim_id`, `attempt_number`, and `lease_expires_at`.
10. Create a `task.claimed` event.
11. Commit all changes atomically.

Return a typed result:

```json
{
  "success": true,
  "task_id": "TASK-001",
  "claim_id": "claim-123",
  "lease_expires_at": "2026-09-26T12:30:00Z"
}
```

For a conflict return a 409 response with the current owner and reason:

```json
{
  "success": false,
  "reason": "already_claimed",
  "owner_agent_id": "agent-abc",
  "current_task_status": "in_progress"
}
```

Every heartbeat, checkpoint, reservation, completion, and release request must include the active `claim_id`. Reject stale claims.

## Lease and Failure Handling

Implement these endpoints:

```text
POST /api/agents/register
POST /api/agents/:id/heartbeat
POST /api/tasks/:taskId/claim
POST /api/tasks/:taskId/release
POST /api/tasks/:taskId/requeue
POST /api/tasks/:taskId/checkpoint
POST /api/tasks/:taskId/reservations
POST /api/tasks/:taskId/complete
```

Failure rules:

- One missed heartbeat is not a failure.
- A task becomes stale after its lease expires.
- Requeueing expires the old claim and releases reservations.
- Requeueing increments `attempt_number`.
- Requeueing creates a `task.requeued` event.
- An old agent cannot complete a requeued task.
- The previous worktree and checkpoints remain available for handoff.
- The website shows the reason for requeueing.

Use these timing defaults:

```text
Heartbeat interval: 15 seconds
Default lease: 5 minutes
Grace period: 2 minutes
```

## Event Contract

Create shared Zod schemas for these event types:

```text
project.created
plan.generated
plan.approved
agent.connected
agent.heartbeat
agent.disconnected
task.created
task.claimed
task.claim_rejected
task.started
task.checkpoint
task.blocked
task.failed
task.stale
task.requeued
task.completed
task.cancelled
file.reserved
file.released
verification.started
verification.completed
pull_request.created
pull_request.updated
```

Example:

```json
{
  "id": "evt_104",
  "sequence_number": 104,
  "event_type": "task.claim_rejected",
  "project_id": "project-123",
  "task_id": "TASK-001",
  "agent_id": "agent-xyz",
  "claim_id": null,
  "actor_type": "agent",
  "payload": {
    "reason": "already_claimed",
    "current_owner": "agent-abc"
  },
  "created_at": "2026-09-26T12:00:00Z"
}
```

## GECKOLOG Synchronization

The database events are canonical. `GECKOLOG.jsonl` is an exported audit copy.

Implement:

```text
GET /api/projects/:id/events?after_sequence=103
POST /api/projects/:id/events/ack
```

The CLI pulls only events after its last acknowledged sequence. The website reads the database and subscribes to Realtime changes.

Do not accept arbitrary client-written events. The API must validate that:

- The agent belongs to the project.
- The claim ID is valid for the task.
- The event is legal for the current task state.
- The client is authorized to create the event.

## Website Pages

Implement these pages:

```text
/                         landing page
/auth                     authentication flow
/projects                 project list
/projects/new             connect a GitHub repository
/projects/:id             project dashboard
/projects/:id/plan        plan review and approval
/projects/:id/tasks       task board
/projects/:id/tasks/:id   task detail
/projects/:id/agents      agent list and presence
/projects/:id/files       file reservations
/projects/:id/events      GECKOLOG event stream
/projects/:id/pull-requests pull requests
/projects/:id/settings   project settings
```

The project dashboard must show:

- Repository name and branch
- Plan status
- Task counts by status
- Task dependency graph
- Active agents
- Current task per agent
- File reservations
- Recent events
- Open pull requests
- Failed and stale tasks

## UI Behavior

Implement human controls for:

- Approve plan
- Edit task
- Add task
- Add dependency
- Release task
- Requeue task
- Cancel task
- Override file reservation
- Pause agent display state
- View previous checkpoints
- View task attempt history

Make it clear when an action is destructive. Do not automatically merge pull requests.

## GitHub Integration

For the MVP, support public repositories with GitHub login.

Implement:

- Parse owner and repository from URL.
- Fetch repository metadata.
- Fetch default branch.
- Display recent commits.
- Link to issues.
- Link to pull requests.
- Display public PR status.

Do not store GitHub access tokens unless required. Private repository support is later work.

## Security Requirements

- Enforce Supabase Row Level Security.
- Users can only access their own projects.
- Verify project membership on every request.
- Validate every route parameter with Zod.
- Never execute repository code on Vercel.
- Never store IBM Bob API keys.
- Never log credentials or access tokens.
- Redact likely secrets from event payloads.
- Rate-limit plan and task APIs.
- Limit event payload size.
- Prevent clients from writing arbitrary event types.
- Do not trust task status sent by the client.

## Web Tasks

### Foundation

- [ ] Create Next.js application.
- [ ] Configure TypeScript and strict linting.
- [ ] Configure Supabase client.
- [ ] Add shared protocol package.
- [ ] Add Zod schemas.
- [ ] Add Vitest.
- [ ] Add Playwright.
- [ ] Add `.env.example`.

### Authentication and Projects

- [ ] Configure GitHub authentication.
- [ ] Implement project creation.
- [ ] Implement repository URL parsing.
- [ ] Implement public repository metadata loading.
- [ ] Implement project membership checks.
- [ ] Add Row Level Security policies.

### Database

- [ ] Create all migrations.
- [ ] Add indexes for project, task, agent, event, and claim lookups.
- [ ] Add unique active-claim constraint.
- [ ] Add atomic `claim_task` RPC.
- [ ] Add atomic `requeue_task` RPC.
- [ ] Add event sequence generation.
- [ ] Add legal state-transition validation.

### API

- [ ] Implement project endpoints.
- [ ] Implement task endpoints.
- [ ] Implement plan endpoints.
- [ ] Implement agent registration.
- [ ] Implement heartbeat endpoint.
- [ ] Implement claim endpoint.
- [ ] Implement release endpoint.
- [ ] Implement requeue endpoint.
- [ ] Implement checkpoint endpoint.
- [ ] Implement reservation endpoint.
- [ ] Implement event cursor endpoint.
- [ ] Implement pull request endpoint.

### Dashboard

- [ ] Build project dashboard.
- [ ] Build task board.
- [ ] Build task dependency graph.
- [ ] Build agent status cards.
- [ ] Build file reservation view.
- [ ] Build event log view.
- [ ] Build pull request view.
- [ ] Build plan approval view.
- [ ] Add Realtime subscriptions.
- [ ] Add polling fallback.

### Tests

- [ ] Test authentication authorization.
- [ ] Test project isolation.
- [ ] Test duplicate claim race.
- [ ] Test prerequisite rejection.
- [ ] Test stale lease requeue.
- [ ] Test stale claim completion rejection.
- [ ] Test event cursor synchronization.
- [ ] Test Realtime dashboard updates.
- [ ] Test public repository import.
- [ ] Run Playwright end-to-end flow.

## Web Acceptance Criteria

The web project is complete when:

1. A user can sign in with GitHub.
2. A user can create a project from a public repository URL.
3. A project displays approved plan and tasks.
4. A CLI can register an agent.
5. Two agents can race for one task.
6. Exactly one claim succeeds.
7. The rejected claim creates an event.
8. The website shows both the owner and rejected agent.
9. A stale claim can be requeued.
10. A requeued task becomes visible to other agents.
11. A CLI event appears on the dashboard.
12. The event cursor does not duplicate or skip events.

## Deployment

- Deploy Next.js to Vercel.
- Create a Supabase project.
- Apply migrations.
- Configure Supabase Auth.
- Configure Vercel environment variables.
- Configure production URL.
- Add preview environment configuration.
- Add GitHub OAuth redirect URLs.
- Run database and Playwright smoke tests after deployment.

Do not implement a production worker in Vercel. The worker is the CLI running on developer laptops in this architecture.
