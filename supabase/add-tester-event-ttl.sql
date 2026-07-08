-- テスト販売ユーザーが作成したイベントだけを、イベント作成から3日後に削除します。
-- 対象は app_state.id が sandbox:% のテスト環境のみです。本番用の app_state.id = 'main' は対象外です。

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
        and value->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
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
grant execute on function public.cleanup_expired_tester_events() to service_role;

-- Supabase Cronは内部的にpg_cronを使います。
-- 既存ジョブがあれば差し替えて、1時間に1回期限切れテストイベントを削除します。
create schema if not exists extensions;
create extension if not exists pg_cron with schema extensions;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('cleanup-expired-tester-events');
    exception
      when others then
        null;
    end;

    perform cron.schedule(
      'cleanup-expired-tester-events',
      '0 * * * *',
      $job$select public.cleanup_expired_tester_events();$job$
    );
  end if;
end;
$do$;

select
  to_regprocedure('public.cleanup_expired_tester_events()') is not null as has_cleanup_function,
  exists (select 1 from pg_extension where extname = 'pg_cron') as has_pg_cron,
  exists (
    select 1
    from cron.job
    where jobname = 'cleanup-expired-tester-events'
  ) as has_cleanup_job;
