-- Migration: 001_initial_schema.sql
-- Creates all Gecko coordination tables

-- Enable extensions
create extension if not exists "pgcrypto";

-- ─── users ───────────────────────────────────────────────────────────────────
create table public.users (
  id                uuid primary key default gen_random_uuid(),
  github_user_id    bigint unique not null,
  github_login      text not null,
  display_name      text,
  avatar_url        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── projects ────────────────────────────────────────────────────────────────
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  repository_url    text not null,
  repository_owner  text not null,
  repository_name   text not null,
  default_branch    text not null default 'main',
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_projects_owner on public.projects(owner_id);
create unique index idx_projects_repo on public.projects(owner_id, repository_owner, repository_name);

-- ─── plans ───────────────────────────────────────────────────────────────────
create table public.plans (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  version         integer not null default 1,
  source_file     text,
  goal            text,
  status          text not null default 'draft',
  generated_by    text,
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint plans_status_check check (status in ('draft','approved','superseded'))
);

create index idx_plans_project on public.plans(project_id);

-- ─── tasks ───────────────────────────────────────────────────────────────────
create table public.tasks (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects(id) on delete cascade,
  plan_id                   uuid references public.plans(id) on delete set null,
  display_id                text not null,
  title                     text not null,
  description               text,
  acceptance_criteria_json  jsonb not null default '[]',
  expected_files_json       jsonb not null default '[]',
  verification_commands_json jsonb not null default '[]',
  priority                  integer not null default 50,
  risk                      text,
  status                    text not null default 'draft',
  assigned_agent_id         uuid,
  claim_id                  uuid,
  attempt_number            integer not null default 0,
  lease_expires_at          timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint tasks_status_check check (
    status in ('draft','ready','claimed','in_progress','testing','blocked',
               'failed','stale','requeued','review','completed','cancelled')
  ),
  constraint tasks_display_id_project unique (project_id, display_id)
);

create index idx_tasks_project on public.tasks(project_id);
create index idx_tasks_plan on public.tasks(plan_id);
create index idx_tasks_status on public.tasks(project_id, status);
create index idx_tasks_agent on public.tasks(assigned_agent_id);

-- ─── task_dependencies ───────────────────────────────────────────────────────
create table public.task_dependencies (
  task_id           uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint no_self_dependency check (task_id <> depends_on_task_id)
);

create index idx_task_deps_depends_on on public.task_dependencies(depends_on_task_id);

-- ─── agents ──────────────────────────────────────────────────────────────────
create table public.agents (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  stable_agent_id   text not null,
  display_name      text,
  provider_name     text,
  model_name        text,
  capabilities_json jsonb not null default '{}',
  status            text not null default 'offline',
  current_task_id   uuid references public.tasks(id) on delete set null,
  last_heartbeat_at timestamptz,
  connected_at      timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint agents_status_check check (
    status in ('offline','online','idle','planning','coding','testing','blocked','review','failed')
  ),
  constraint agents_stable_id_project unique (project_id, stable_agent_id)
);

create index idx_agents_project on public.agents(project_id);
create index idx_agents_status on public.agents(project_id, status);

-- ─── task_claims ─────────────────────────────────────────────────────────────
create table public.task_claims (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.tasks(id) on delete cascade,
  agent_id          uuid not null references public.agents(id) on delete cascade,
  attempt_number    integer not null default 1,
  status            text not null default 'active',
  claimed_at        timestamptz not null default now(),
  lease_expires_at  timestamptz not null,
  released_at       timestamptz,
  rejection_reason  text,
  constraint task_claims_status_check check (
    status in ('active','released','expired','completed','rejected')
  )
);

create index idx_task_claims_task on public.task_claims(task_id);
create index idx_task_claims_agent on public.task_claims(agent_id);

-- Only one active claim per task
create unique index idx_task_claims_active
  on public.task_claims(task_id)
  where status = 'active';

-- ─── file_reservations ───────────────────────────────────────────────────────
create table public.file_reservations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  agent_id      uuid not null references public.agents(id) on delete cascade,
  path_pattern  text not null,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint file_reservations_status_check check (status in ('active','released','expired'))
);

create index idx_file_reservations_project on public.file_reservations(project_id, status);
create index idx_file_reservations_task on public.file_reservations(task_id);

-- ─── checkpoints ─────────────────────────────────────────────────────────────
create table public.checkpoints (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete set null,
  agent_id      uuid references public.agents(id) on delete set null,
  claim_id      uuid references public.task_claims(id) on delete set null,
  message       text not null,
  metadata_json jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index idx_checkpoints_task on public.checkpoints(task_id);
create index idx_checkpoints_claim on public.checkpoints(claim_id);

-- ─── events ──────────────────────────────────────────────────────────────────
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  sequence_number bigint not null,
  event_type      text not null,
  task_id         uuid references public.tasks(id) on delete set null,
  agent_id        uuid references public.agents(id) on delete set null,
  claim_id        uuid references public.task_claims(id) on delete set null,
  actor_type      text not null default 'system',
  payload_json    jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  constraint events_sequence_unique unique (project_id, sequence_number),
  constraint events_actor_type_check check (actor_type in ('agent','user','system'))
);

create index idx_events_project_seq on public.events(project_id, sequence_number);
create index idx_events_task on public.events(task_id);
create index idx_events_type on public.events(project_id, event_type);

-- ─── pull_requests ────────────────────────────────────────────────────────────
create table public.pull_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  task_id         uuid references public.tasks(id) on delete set null,
  agent_id        uuid references public.agents(id) on delete set null,
  github_pr_number integer not null,
  github_url      text not null,
  branch_name     text not null,
  status          text not null default 'open',
  checks_status   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pr_project_number unique (project_id, github_pr_number)
);

create index idx_pull_requests_project on public.pull_requests(project_id);
create index idx_pull_requests_task on public.pull_requests(task_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger trg_plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger trg_agents_updated_at before update on public.agents
  for each row execute function public.set_updated_at();
create trigger trg_pull_requests_updated_at before update on public.pull_requests
  for each row execute function public.set_updated_at();
