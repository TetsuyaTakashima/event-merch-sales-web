create or replace function public.can_write_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_app_state()
$$;

revoke insert, update on public.app_state from authenticated;
grant select on public.app_state to authenticated;
grant all privileges on public.app_state to service_role;

grant execute on function public.can_write_app_state() to authenticated, service_role;

drop policy if exists "app_state_insert_active" on public.app_state;
create policy "app_state_insert_active"
on public.app_state for insert
to authenticated
with check (public.can_manage_app_state());

drop policy if exists "app_state_update_active" on public.app_state;
create policy "app_state_update_active"
on public.app_state for update
to authenticated
using (public.can_manage_app_state())
with check (public.can_manage_app_state());
