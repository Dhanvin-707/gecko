-- Migration: 002_event_sequence.sql
-- Atomic sequence generation per project and event helpers

-- Per-project sequence table
create table public.project_sequences (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  last_sequence bigint not null default 0
);

-- Function: get next sequence number for a project (called inside transactions)
create or replace function public.next_event_sequence(p_project_id uuid)
  returns bigint
  language plpgsql
as $$
declare
  v_seq bigint;
begin
  insert into public.project_sequences(project_id, last_sequence)
    values (p_project_id, 1)
    on conflict (project_id) do update
      set last_sequence = project_sequences.last_sequence + 1
    returning last_sequence into v_seq;
  return v_seq;
end;
$$;

-- Function: insert an event atomically
create or replace function public.insert_event(
  p_project_id  uuid,
  p_event_type  text,
  p_task_id     uuid,
  p_agent_id    uuid,
  p_claim_id    uuid,
  p_actor_type  text,
  p_payload     jsonb
)
  returns public.events
  language plpgsql
as $$
declare
  v_seq bigint;
  v_event public.events;
begin
  v_seq := public.next_event_sequence(p_project_id);
  insert into public.events(
    project_id, sequence_number, event_type,
    task_id, agent_id, claim_id, actor_type, payload_json
  ) values (
    p_project_id, v_seq, p_event_type,
    p_task_id, p_agent_id, p_claim_id, p_actor_type, p_payload
  ) returning * into v_event;
  return v_event;
end;
$$;
