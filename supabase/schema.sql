create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'staff',
  active boolean not null default true,
  account_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'staff', 'tester', 'viewer'));

update public.profiles
set account_status = case when active then 'active' else 'pending' end
where account_status is null
   or account_status not in ('pending', 'active', 'suspended');

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending', 'active', 'suspended'));

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

create or replace function public.can_write_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_app_state_id(public.app_state_current_id())
$$;

create or replace function public.cleanup_expired_tester_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sandbox_record record;
  expired_event_ids text[];
  expired_count integer;
  removed_count integer := 0;
  new_events jsonb;
  new_products jsonb;
  new_product_list jsonb;
  new_product jsonb;
  new_event_ids jsonb;
  new_event_statuses jsonb;
  new_sales jsonb;
  new_inventories jsonb;
  new_adjustments jsonb;
  product_record record;
begin
  for sandbox_record in
    select id, data, version
    from public.app_state
    where id like 'sandbox:%'
    for update
  loop
    select coalesce(array_agg(event_id), array[]::text[])
    into expired_event_ids
    from (
      select value->>'id' as event_id
      from jsonb_array_elements(coalesce(sandbox_record.data->'events', '[]'::jsonb)) as events(value)
      where value ? 'id'
        and value ? 'createdAt'
        and value->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T'
        and (value->>'createdAt')::timestamptz < now() - interval '3 days'
    ) expired;

    expired_count := coalesce(array_length(expired_event_ids, 1), 0);
    if expired_count = 0 then
      continue;
    end if;

    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into new_events
    from jsonb_array_elements(coalesce(sandbox_record.data->'events', '[]'::jsonb)) with ordinality as events(value, ordinality)
    where not (value->>'id' = any(expired_event_ids));

    new_product_list := '[]'::jsonb;
    for product_record in
      select value, ordinality
      from jsonb_array_elements(coalesce(sandbox_record.data->'products', '[]'::jsonb)) with ordinality as products(value, ordinality)
    loop
      select coalesce(jsonb_agg(to_jsonb(event_id) order by ordinality), '[]'::jsonb)
      into new_event_ids
      from jsonb_array_elements_text(coalesce(product_record.value->'eventIds', '[]'::jsonb)) with ordinality as event_ids(event_id, ordinality)
      where not (event_id = any(expired_event_ids));

      if jsonb_array_length(new_event_ids) = 0 then
        continue;
      end if;

      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      into new_event_statuses
      from jsonb_each(coalesce(product_record.value->'eventStatuses', '{}'::jsonb))
      where not (key = any(expired_event_ids));

      new_product := product_record.value - 'eventId';
      new_product := jsonb_set(new_product, '{eventIds}', new_event_ids, true);
      new_product := jsonb_set(new_product, '{eventStatuses}', new_event_statuses, true);
      new_product_list := new_product_list || jsonb_build_array(new_product);
    end loop;
    new_products := new_product_list;

    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into new_sales
    from jsonb_array_elements(coalesce(sandbox_record.data->'sales', '[]'::jsonb)) with ordinality as sales(value, ordinality)
    where not (value->>'eventId' = any(expired_event_ids));

    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into new_inventories
    from jsonb_array_elements(coalesce(sandbox_record.data->'inventories', '[]'::jsonb)) with ordinality as inventories(value, ordinality)
    where not (value->>'eventId' = any(expired_event_ids));

    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into new_adjustments
    from jsonb_array_elements(coalesce(sandbox_record.data->'adjustments', '[]'::jsonb)) with ordinality as adjustments(value, ordinality)
    where not (value->>'eventId' = any(expired_event_ids));

    update public.app_state
    set
      data = sandbox_record.data || jsonb_build_object(
        'events', new_events,
        'products', new_products,
        'sales', new_sales,
        'inventories', new_inventories,
        'adjustments', new_adjustments
      ),
      version = sandbox_record.version + 1,
      updated_at = now()
    where id = sandbox_record.id;

    removed_count := removed_count + expired_count;
  end loop;

  return removed_count;
end;
$$;

revoke all on function public.cleanup_expired_tester_events() from public;

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
grant execute on function public.app_state_current_role() to authenticated, service_role;
grant execute on function public.app_state_current_id() to authenticated, service_role;
grant execute on function public.can_read_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_write_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_write_app_state() to authenticated, service_role;
grant execute on function public.cleanup_expired_tester_events() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.touch_updated_at() to service_role;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_user()
  or public.app_state_current_role() in ('manager', 'staff', 'viewer')
);

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
using (public.can_read_app_state_id(id));

drop policy if exists "app_state_insert_active" on public.app_state;
create policy "app_state_insert_active"
on public.app_state for insert
to authenticated
with check (public.can_write_app_state_id(id));

-- RPC関数とapp_state直書き制限は supabase/add-app-state-rpc.sql で追加します。
-- 新規セットアップ時も schema.sql の後に add-app-state-rpc.sql を実行してください。

drop policy if exists "app_state_update_active" on public.app_state;
create policy "app_state_update_active"
on public.app_state for update
to authenticated
using (public.can_write_app_state_id(id))
with check (public.can_write_app_state_id(id));
