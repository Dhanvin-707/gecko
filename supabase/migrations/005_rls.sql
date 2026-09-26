-- Migration: 005_rls.sql
-- Row Level Security policies

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.agents enable row level security;
alter table public.task_claims enable row level security;
alter table public.file_reservations enable row level security;
alter table public.checkpoints enable row level security;
alter table public.events enable row level security;
alter table public.pull_requests enable row level security;
alter table public.project_sequences enable row level security;

-- ─── Helper: get the internal user id for the current auth session ───────────
create or replace function public.current_user_id()
  returns uuid
  language sql stable
as $$
  select id from public.users
   where github_user_id = (auth.jwt() ->> 'sub')::bigint
   limit 1;
$$;

-- ─── users: each user can only see/edit their own row ────────────────────────
create policy "users_select_own" on public.users
  for select using (id = public.current_user_id());

create policy "users_insert_own" on public.users
  for insert with check (true); -- handled by server via service role

create policy "users_update_own" on public.users
  for update using (id = public.current_user_id());

-- ─── projects: owner access only ─────────────────────────────────────────────
create policy "projects_select_owner" on public.projects
  for select using (owner_id = public.current_user_id());

create policy "projects_insert_owner" on public.projects
  for insert with check (owner_id = public.current_user_id());

create policy "projects_update_owner" on public.projects
  for update using (owner_id = public.current_user_id());

create policy "projects_delete_owner" on public.projects
  for delete using (owner_id = public.current_user_id());

-- ─── plans: project owner only ───────────────────────────────────────────────
create policy "plans_select_owner" on public.plans
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = plans.project_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "plans_insert_owner" on public.plans
  for insert with check (
    exists (
      select 1 from public.projects p
       where p.id = plans.project_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "plans_update_owner" on public.plans
  for update using (
    exists (
      select 1 from public.projects p
       where p.id = plans.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── tasks ────────────────────────────────────────────────────────────────────
create policy "tasks_select_owner" on public.tasks
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = tasks.project_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "tasks_insert_owner" on public.tasks
  for insert with check (
    exists (
      select 1 from public.projects p
       where p.id = tasks.project_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "tasks_update_owner" on public.tasks
  for update using (
    exists (
      select 1 from public.projects p
       where p.id = tasks.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── task_dependencies ───────────────────────────────────────────────────────
create policy "task_deps_select_owner" on public.task_dependencies
  for select using (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
       where t.id = task_dependencies.task_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "task_deps_insert_owner" on public.task_dependencies
  for insert with check (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
       where t.id = task_dependencies.task_id
         and p.owner_id = public.current_user_id()
    )
  );

create policy "task_deps_delete_owner" on public.task_dependencies
  for delete using (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
       where t.id = task_dependencies.task_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── agents ──────────────────────────────────────────────────────────────────
create policy "agents_select_owner" on public.agents
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = agents.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── task_claims ─────────────────────────────────────────────────────────────
create policy "task_claims_select_owner" on public.task_claims
  for select using (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
       where t.id = task_claims.task_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── file_reservations ───────────────────────────────────────────────────────
create policy "file_res_select_owner" on public.file_reservations
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = file_reservations.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── checkpoints ─────────────────────────────────────────────────────────────
create policy "checkpoints_select_owner" on public.checkpoints
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = checkpoints.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── events ──────────────────────────────────────────────────────────────────
create policy "events_select_owner" on public.events
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = events.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── pull_requests ────────────────────────────────────────────────────────────
create policy "prs_select_owner" on public.pull_requests
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = pull_requests.project_id
         and p.owner_id = public.current_user_id()
    )
  );

-- ─── project_sequences: no direct client access ───────────────────────────────
-- (accessed only via service role in RPC functions)
