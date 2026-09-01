alter table public.workspace_branding
  drop constraint if exists workspace_branding_pdf_template_check;
alter table public.workspace_branding
  add constraint workspace_branding_pdf_template_check check(pdf_template in ('modern','executive','minimal','corporate','luxury'));
alter table public.workspace_branding
  add column if not exists font_family text not null default 'modern' check(font_family in ('modern','classic','editorial')),
  add column if not exists invoice_title text not null default 'INVOICE',
  add column if not exists header_style text not null default 'split' check(header_style in ('split','banner','minimal')),
  add column if not exists table_style text not null default 'solid' check(table_style in ('solid','soft','lines')),
  add column if not exists footer_text text not null default 'Thank you for your business!',
  add column if not exists payment_instructions text,
  add column if not exists terms_text text,
  add column if not exists signature_url text,
  add column if not exists stamp_url text,
  add column if not exists background_watermark text,
  add column if not exists show_signature boolean not null default false,
  add column if not exists show_stamp boolean not null default false;

create or replace function public.get_shared_invoice_branding(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_brand public.workspace_branding%rowtype; v_plan text;
begin
 select coalesce(p.plan,case when p.is_pro then 'pro' else 'free' end)
 into v_plan
 from public.invoices i
 join public.profiles p on p.user_id=i.user_id
 where i.share_token=p_token limit 1;
 select b.* into v_brand from public.invoices i join public.workspaces w on w.owner_user_id=i.user_id join public.workspace_branding b on b.workspace_id=w.id where i.share_token=p_token limit 1;
 if v_plan<>'business' or v_brand.workspace_id is null then return null; end if;
 return to_jsonb(v_brand)-'workspace_id'-'updated_by';
end; $$;
grant execute on function public.get_shared_invoice_branding(uuid) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('brand-assets','brand-assets',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "brand owners upload assets" on storage.objects;
create policy "brand owners upload assets" on storage.objects for insert to authenticated
with check(bucket_id='brand-assets' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.workspaces where owner_user_id=auth.uid()));
drop policy if exists "brand owners update assets" on storage.objects;
create policy "brand owners update assets" on storage.objects for update to authenticated
using(bucket_id='brand-assets' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='brand-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "brand owners delete assets" on storage.objects;
create policy "brand owners delete assets" on storage.objects for delete to authenticated
using(bucket_id='brand-assets' and (storage.foldername(name))[1]=auth.uid()::text);
