alter table public.profiles
  add column if not exists account_status text not null default 'active';

update public.profiles
set account_status = case when active then 'active' else 'pending' end
where account_status is null
   or account_status not in ('pending', 'active', 'suspended');

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending', 'active', 'suspended'));

create or replace function public.is_active_user()
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
      and active = true
      and account_status = 'active'
  );
$$;

create or replace function public.is_admin_user()
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
      and role = 'admin'
      and active = true
      and account_status = 'active'
  );
$$;

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
      and role in ('admin', 'manager')
      and active = true
      and account_status = 'active'
  );
$$;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;

  insert into public.profiles (id, email, name, role, active, account_status)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'スタッフ'),
    case when first_user then 'admin' else 'staff' end,
    first_user,
    case when first_user then 'active' else 'pending' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.can_write_app_state() to authenticated, service_role;
grant execute on function public.app_state_current_role() to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
