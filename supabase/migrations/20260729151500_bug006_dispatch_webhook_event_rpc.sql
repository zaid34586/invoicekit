-- Bug-006 (real fix): "reliable webhook auto-delivery via new dispatch RPC"
-- was shipped last time as a frontend-only change. src/pages/NewInvoice.tsx
-- already calls `supabase.rpc("dispatch_webhook_event", ...)` after creating
-- an invoice, but that function was never actually created anywhere in the
-- migrations -- it does not exist in the database at all. The call sits
-- inside a try/catch ("Webhook delivery is best-effort"), so it silently
-- fails every time and the invoice.created delivery is left at status
-- 'pending' until someone manually clicks Retry (or a cron job runs).
--
-- This adds the missing function. It does NOT insert a new delivery row --
-- public.business_event_trigger() already inserts a 'pending' delivery row
-- for every active webhook subscribed to the event when the invoice row is
-- inserted. Re-inserting here would double-fire the webhook. Instead this
-- function looks up the delivery rows the trigger just queued for the
-- current workspace/event and returns their ids, so the frontend can
-- immediately invoke the business-webhooks edge function for each one
-- instead of waiting for a human to hit Retry.
create or replace function public.dispatch_webhook_event(p_event_type text, p_payload jsonb default '{}'::jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_workspace uuid;
  v_ids uuid[];
begin
  v_owner := public.current_workspace_owner_id();
  select id into v_workspace from public.workspaces where owner_user_id = v_owner;
  if v_workspace is null then
    return '{}'::uuid[];
  end if;

  select array_agg(d.id) into v_ids
  from public.workspace_webhook_deliveries d
  join public.workspace_webhooks w on w.id = d.webhook_id
  where w.workspace_id = v_workspace
    and w.active
    and d.event_type = p_event_type
    and d.status = 'pending'
    and d.created_at > now() - interval '30 seconds';

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;
grant execute on function public.dispatch_webhook_event(text, jsonb) to authenticated;
