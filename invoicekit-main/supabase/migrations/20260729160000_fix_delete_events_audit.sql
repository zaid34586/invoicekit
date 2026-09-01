-- Bug-011 fix: public.business_event_trigger() already had DELETE-handling
-- logic written (v_owner/v_data pulled from OLD on delete), but the actual
-- triggers were only ever created "after insert or update" -- DELETE never
-- fired the function at all. So deleting an invoice or client produced
-- neither a webhook event nor an audit log entry.
create or replace function public.business_event_trigger() returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_workspace uuid; v_event text; v_entity text; v_payload jsonb; v_data jsonb; v_audit_action text;
begin
  if tg_op='DELETE' then v_owner:=old.user_id; v_data:=to_jsonb(old); else v_owner:=new.user_id; v_data:=to_jsonb(new); end if;
  select id into v_workspace from public.workspaces where owner_user_id=v_owner;
  if v_workspace is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  v_entity:=tg_table_name;
  v_event:=case
    when tg_table_name='invoices' and tg_op='INSERT' then 'invoice.created'
    when tg_table_name='invoices' and tg_op='DELETE' then 'invoice.deleted'
    when tg_table_name='invoices' and tg_op='UPDATE' and new.status='paid' and old.status is distinct from new.status then 'invoice.paid'
    when tg_table_name='invoices' and tg_op='UPDATE' and new.status='overdue' and old.status is distinct from new.status then 'invoice.overdue'
    when tg_table_name='invoices' and tg_op='UPDATE' then 'invoice.updated'
    when tg_table_name='clients' and tg_op='INSERT' then 'customer.created'
    when tg_table_name='clients' and tg_op='DELETE' then 'customer.deleted'
    else 'customer.updated'
  end;
  v_payload:=jsonb_build_object('event',v_event,'workspace_id',v_workspace,'data',v_data,'created_at',now());
  insert into public.workspace_webhook_deliveries(webhook_id,event_type,payload) select id,v_event,v_payload from public.workspace_webhooks where workspace_id=v_workspace and active and v_event=any(events);
  v_audit_action:=case
    when tg_op='DELETE' and tg_table_name='invoices' then 'invoice.deleted'
    when tg_op='DELETE' then 'customer.deleted'
    when tg_op='UPDATE' and tg_table_name='invoices' then 'invoice.edited'
    when tg_op='UPDATE' then 'customer.updated'
    else null
  end;
  if v_audit_action is not null then
    insert into public.workspace_audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(v_workspace,auth.uid(),v_audit_action,tg_table_name,coalesce(new.id,old.id)::text,'{}');
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

drop trigger if exists business_invoice_events on public.invoices;
create trigger business_invoice_events after insert or update or delete on public.invoices for each row execute function public.business_event_trigger();
drop trigger if exists business_client_events on public.clients;
create trigger business_client_events after insert or update or delete on public.clients for each row execute function public.business_event_trigger();
