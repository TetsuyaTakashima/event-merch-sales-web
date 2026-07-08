alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'staff', 'tester', 'viewer'));

create or replace function public.app_state_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and active = true
    and account_status = 'active'
  limit 1
$$;

create or replace function public.app_state_current_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.app_state_current_role() = 'tester' then 'sandbox:' || auth.uid()::text
    when public.app_state_current_role() in ('admin', 'manager', 'staff', 'viewer') then 'main'
    else null
  end
$$;

create or replace function public.can_read_app_state_id(p_state_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.app_state_current_role() = 'tester' then p_state_id = public.app_state_current_id()
    when public.app_state_current_role() in ('admin', 'manager', 'staff', 'viewer') then p_state_id = 'main'
    else false
  end
$$;

create or replace function public.can_write_app_state_id(p_state_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.app_state_current_role() = 'tester' then p_state_id = public.app_state_current_id()
    when public.app_state_current_role() in ('admin', 'manager') then p_state_id = 'main'
    else false
  end
$$;

create or replace function public.can_manage_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_state_current_role() in ('admin', 'manager', 'tester')
$$;

create or replace function public.can_write_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_app_state_id(public.app_state_current_id())
$$;

grant execute on function public.app_state_current_role() to authenticated, service_role;
grant execute on function public.app_state_current_id() to authenticated, service_role;
grant execute on function public.can_read_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_write_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_manage_app_state() to authenticated, service_role;
grant execute on function public.can_write_app_state() to authenticated, service_role;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_user()
  or public.app_state_current_role() in ('manager', 'staff', 'viewer')
);

drop policy if exists "app_state_select_active" on public.app_state;
create policy "app_state_select_active"
on public.app_state for select
to authenticated
using (public.can_read_app_state_id(id));

drop policy if exists "app_state_insert_active" on public.app_state;
create policy "app_state_insert_active"
on public.app_state for insert
to authenticated
with check (public.can_write_app_state_id(id));

drop policy if exists "app_state_update_active" on public.app_state;
create policy "app_state_update_active"
on public.app_state for update
to authenticated
using (public.can_write_app_state_id(id))
with check (public.can_write_app_state_id(id));
