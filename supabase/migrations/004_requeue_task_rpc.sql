-- Migration: 004_requeue_task_rpc.sql
-- Atomic requeue_task RPC

create or replace function public.requeue_task(
  p_project_id  uuid,
  p_task_id     uuid,
  p_claim_id    uuid,
  p_reason      text,
  p_actor_type  text default 'user',
  p_actor_id    uuid default null
)
  returns jsonb
  language plpgsql
as $$
declare
  v_task   public.tasks;
  v_claim  public.task_claims;
begin
  select * into v_task
    from public.tasks
   where id = p_task_id and project_id = p_project_id
     for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'task_not_found');
  end if;

  -- Validate claim if provided
  if p_claim_id is not null then
    select * into v_claim
      from public.task_claims
     where id = p_claim_id and task_id = p_task_id;

    if not found then
      return jsonb_build_object('success', false, 'reason', 'claim_not_found');
    end if;

    -- Expire the claim
    update public.task_claims
       set status = 'expired', released_at = now()
     where id = p_claim_id and status = 'active';
  end if;

  -- Release file reservations
  update public.file_reservations
     set status = 'released'
   where task_id = p_task_id and status = 'active';

  -- Transition task to requeued
  update public.tasks
     set status = 'requeued',
         assigned_agent_id = null,
         claim_id = null,
         lease_expires_at = null
   where id = p_task_id;

  -- Record event
  perform public.insert_event(
    p_project_id, 'task.requeued',
    p_task_id, v_task.assigned_agent_id, p_claim_id, p_actor_type,
    jsonb_build_object(
      'previous_claim_id', p_claim_id,
      'reason', p_reason,
      'attempt_number', v_task.attempt_number
    )
  );

  return jsonb_build_object('success', true, 'task_id', p_task_id);
end;
$$;
