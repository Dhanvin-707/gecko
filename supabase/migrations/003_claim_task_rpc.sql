-- Migration: 003_claim_task_rpc.sql
-- Atomic claim_task RPC

create or replace function public.claim_task(
  p_project_id          uuid,
  p_task_id             uuid,
  p_agent_id            uuid,
  p_requested_claim_id  uuid,
  p_lease_seconds       integer default 300,
  p_expected_task_version integer default null
)
  returns jsonb
  language plpgsql
as $$
declare
  v_task          public.tasks;
  v_claim_id      uuid;
  v_lease_expires timestamptz;
  v_attempt       integer;
  v_dep_count     integer;
begin
  -- Lock the task row for this transaction
  select * into v_task
    from public.tasks
   where id = p_task_id and project_id = p_project_id
     for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'task_not_found',
      'owner_agent_id', null,
      'current_task_status', null
    );
  end if;

  -- Confirm task is in a claimable state
  if v_task.status not in ('ready', 'requeued') then
    return jsonb_build_object(
      'success', false,
      'reason', 'not_ready',
      'owner_agent_id', v_task.assigned_agent_id,
      'current_task_status', v_task.status
    );
  end if;

  -- Confirm all dependencies are completed
  select count(*) into v_dep_count
    from public.task_dependencies td
    join public.tasks dep on dep.id = td.depends_on_task_id
   where td.task_id = p_task_id
     and dep.status <> 'completed';

  if v_dep_count > 0 then
    return jsonb_build_object(
      'success', false,
      'reason', 'dependencies_incomplete',
      'owner_agent_id', null,
      'current_task_status', v_task.status
    );
  end if;

  -- Expire stale active claims
  update public.task_claims
     set status = 'expired',
         released_at = now()
   where task_id = p_task_id
     and status = 'active'
     and lease_expires_at < now();

  -- Check for remaining active claim
  if exists (
    select 1 from public.task_claims
     where task_id = p_task_id and status = 'active'
  ) then
    return jsonb_build_object(
      'success', false,
      'reason', 'already_claimed',
      'owner_agent_id', v_task.assigned_agent_id,
      'current_task_status', v_task.status
    );
  end if;

  -- Determine claim ID and attempt number
  v_claim_id := coalesce(p_requested_claim_id, gen_random_uuid());
  v_lease_expires := now() + (p_lease_seconds || ' seconds')::interval;
  v_attempt := v_task.attempt_number + 1;

  -- Create the claim
  insert into public.task_claims(id, task_id, agent_id, attempt_number, status, lease_expires_at)
    values (v_claim_id, p_task_id, p_agent_id, v_attempt, 'active', v_lease_expires);

  -- Update task
  update public.tasks
     set status = 'claimed',
         assigned_agent_id = p_agent_id,
         claim_id = v_claim_id,
         attempt_number = v_attempt,
         lease_expires_at = v_lease_expires
   where id = p_task_id;

  -- Record event
  perform public.insert_event(
    p_project_id, 'task.claimed',
    p_task_id, p_agent_id, v_claim_id, 'agent',
    jsonb_build_object(
      'claim_id', v_claim_id,
      'lease_expires_at', v_lease_expires,
      'attempt_number', v_attempt
    )
  );

  return jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'claim_id', v_claim_id,
    'lease_expires_at', v_lease_expires
  );
end;
$$;
