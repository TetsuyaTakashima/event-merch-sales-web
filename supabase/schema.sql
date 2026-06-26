create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'staff', 'tester', 'viewer'));

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_state
  add column if not exists version bigint not null default 0;

alter table public.app_state drop constraint if exists app_state_version_check;
alter table public.app_state
  add constraint app_state_version_check
  check (version >= 0);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

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
  );
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

  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'スタッフ'),
    case when first_user then 'admin' else 'staff' end,
    first_user
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant all privileges on public.profiles to service_role;
revoke insert, update on public.app_state from authenticated;
grant select on public.app_state to authenticated;
grant all privileges on public.app_state to service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.can_write_app_state() to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.touch_updated_at() to service_role;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (public.is_active_user() or id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "app_state_select_active" on public.app_state;
create policy "app_state_select_active"
on public.app_state for select
to authenticated
using (public.is_active_user());

drop policy if exists "app_state_insert_active" on public.app_state;
create policy "app_state_insert_active"
on public.app_state for insert
to authenticated
with check (public.can_write_app_state());

-- RPC関数とapp_state直書き制限は supabase/add-app-state-rpc.sql で追加します。
-- 新規セットアップ時も schema.sql の後に add-app-state-rpc.sql を実行してください。

drop policy if exists "app_state_update_active" on public.app_state;
create policy "app_state_update_active"
on public.app_state for update
to authenticated
using (public.can_write_app_state())
with check (public.can_write_app_state());
