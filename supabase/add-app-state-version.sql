alter table public.app_state
  add column if not exists version bigint not null default 0;

alter table public.app_state drop constraint if exists app_state_version_check;
alter table public.app_state
  add constraint app_state_version_check
  check (version >= 0);

create or replace function public.can_write_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager', 'staff')
      and active = true
      and account_status = 'active'
  );
$$;

grant execute on function public.can_write_app_state() to authenticated, service_role;

drop policy if exists "app_state_insert_active" on public.app_state;
create policy "app_state_insert_active"
on public.app_state for insert
to authenticated
with check (public.can_write_app_state());

drop policy if exists "app_state_update_active" on public.app_state;
create policy "app_state_update_active"
on public.app_state for update
to authenticated
using (public.can_write_app_state())
with check (public.can_write_app_state());
