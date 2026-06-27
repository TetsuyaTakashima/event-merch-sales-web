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
  limit 1
$$;

create or replace function public.can_manage_app_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_state_current_role() in ('admin', 'manager')
$$;

create or replace function public.require_app_state_role(allowed_roles text[], action_label text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public.app_state_current_role();
  if v_role is null or v_role <> all(allowed_roles) then
    raise exception '%を実行する権限がありません', action_label
      using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function public.app_state_now_iso()
returns text
language sql
stable
as $$
  select to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.initialize_app_state(p_data jsonb)
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_app_state_role(array['admin', 'manager'], '共有データ初期化');

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '共有データの形式が正しくありません'
      using errcode = '22023';
  end if;

  insert into public.app_state (id, data, version, updated_at)
  values ('main', p_data - 'users' - 'currentUserId' - 'selectedEventId', 0, now())
  on conflict (id) do nothing
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  if data is null then
    select app_state.data, app_state.updated_at, app_state.version
    into data, updated_at, version
    from public.app_state
    where id = 'main';
  end if;

  return next;
end;
$$;

create or replace function public.save_app_state(p_data jsonb, p_expected_version bigint default null)
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  current_version bigint;
begin
  perform public.require_app_state_role(array['admin', 'manager'], '共有データ保存');

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '共有データの形式が正しくありません'
      using errcode = '22023';
  end if;

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  if current_data is null then
    insert into public.app_state (id, data, version, updated_at)
    values ('main', p_data - 'users' - 'currentUserId' - 'selectedEventId', 0, now())
    returning app_state.data, app_state.updated_at, app_state.version
    into data, updated_at, version;
    return next;
  end if;

  if p_expected_version is not null and current_version <> p_expected_version then
    raise exception 'REMOTE_STATE_CONFLICT'
      using errcode = '40001';
  end if;

  update public.app_state
  set
    data = p_data - 'users' - 'currentUserId' - 'selectedEventId',
    version = current_version + 1,
    updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

create or replace function public.create_sale(p_sale jsonb)
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_id text := auth.uid()::text;
  current_data jsonb;
  current_version bigint;
  sale_id text := nullif(p_sale->>'id', '');
  event_id text := nullif(p_sale->>'eventId', '');
  event_record jsonb;
  requested_item jsonb;
  product_record jsonb;
  variant_record jsonb;
  inventory_record jsonb;
  inventory_index integer;
  variant_id text;
  quantity integer;
  current_stock integer;
  unit_price integer;
  sanitized_items jsonb := '[]'::jsonb;
  sanitized_item jsonb;
  sale_total integer := 0;
  payment_method text := coalesce(nullif(p_sale->>'paymentMethod', ''), '現金');
  cash_received numeric;
  change_due numeric;
  sale_record jsonb;
begin
  actor_role := public.require_app_state_role(array['admin', 'manager', 'staff'], '販売登録');

  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    raise exception '販売データの形式が正しくありません'
      using errcode = '22023';
  end if;
  if sale_id is null or event_id is null then
    raise exception '販売IDとイベントIDが必要です'
      using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_sale->'items'), '') <> 'array' or jsonb_array_length(p_sale->'items') = 0 then
    raise exception '販売商品が空です'
      using errcode = '22023';
  end if;

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  if current_data is null then
    raise exception '共有データが初期化されていません'
      using errcode = 'P0002';
  end if;

  select value
  into sale_record
  from jsonb_array_elements(coalesce(current_data->'sales', '[]'::jsonb)) as sales(value)
  where value->>'id' = sale_id
  limit 1;

  if sale_record is not null then
    data := current_data;
    updated_at := (select app_state.updated_at from public.app_state where id = 'main');
    version := current_version;
    return next;
  end if;

  select value
  into event_record
  from jsonb_array_elements(coalesce(current_data->'events', '[]'::jsonb)) as events(value)
  where value->>'id' = event_id
  limit 1;

  if event_record is null or coalesce(event_record->>'status', '') <> 'open' then
    raise exception '販売中のイベントではありません'
      using errcode = '22023';
  end if;

  for requested_item in
    select value from jsonb_array_elements(p_sale->'items') as items(value)
  loop
    variant_id := nullif(requested_item->>'variantId', '');
    quantity := floor(coalesce(nullif(requested_item->>'quantity', ''), '0')::numeric)::integer;

    if variant_id is null or quantity <= 0 then
      raise exception '販売商品の数量が正しくありません'
        using errcode = '22023';
    end if;

    product_record := null;
    variant_record := null;
    select products.value, variants.value
    into product_record, variant_record
    from jsonb_array_elements(coalesce(current_data->'products', '[]'::jsonb)) as products(value)
    cross join jsonb_array_elements(coalesce(products.value->'variants', '[]'::jsonb)) as variants(value)
    where variants.value->>'id' = variant_id
    limit 1;

    if product_record is null or variant_record is null then
      raise exception '商品が見つかりません'
        using errcode = '22023';
    end if;

    if product_record ? 'eventIds' and not (coalesce(product_record->'eventIds', '[]'::jsonb) ? event_id) then
      raise exception '商品がイベントに紐づいていません'
        using errcode = '22023';
    end if;
    if product_record ? 'eventId' and product_record->>'eventId' <> event_id then
      raise exception '商品がイベントに紐づいていません'
        using errcode = '22023';
    end if;
    if coalesce(product_record->'eventStatuses'->>event_id, product_record->>'status', 'active') <> 'active' then
      raise exception '停止中の商品は販売できません'
        using errcode = '22023';
    end if;

    inventory_record := null;
    inventory_index := null;
    select (ordinality - 1)::integer, value
    into inventory_index, inventory_record
    from jsonb_array_elements(coalesce(current_data->'inventories', '[]'::jsonb)) with ordinality as inventories(value, ordinality)
    where value->>'eventId' = event_id
      and value->>'variantId' = variant_id
    limit 1;

    if inventory_record is null then
      raise exception '在庫データが見つかりません'
        using errcode = '22023';
    end if;

    current_stock := floor(coalesce(nullif(inventory_record->>'current', ''), '0')::numeric)::integer;
    if current_stock < quantity then
      raise exception 'サーバー側の在庫が不足しています。画面を更新して確認してください'
        using errcode = '22023';
    end if;

    unit_price := round(coalesce(nullif(variant_record->>'price', ''), '0')::numeric)::integer;
    sanitized_item := jsonb_build_object(
      'productId', product_record->>'id',
      'variantId', variant_id,
      'name', product_record->>'name',
      'variantName', variant_record->>'name',
      'quantity', quantity,
      'unitPrice', unit_price,
      'subtotal', unit_price * quantity
    );
    sanitized_items := sanitized_items || jsonb_build_array(sanitized_item);
    sale_total := sale_total + unit_price * quantity;

    current_data := jsonb_set(
      current_data,
      array['inventories', inventory_index::text, 'current'],
      to_jsonb(current_stock - quantity),
      false
    );
  end loop;

  if payment_method = '現金' then
    if p_sale ? 'cashReceived' and jsonb_typeof(p_sale->'cashReceived') = 'number' then
      cash_received := (p_sale->>'cashReceived')::numeric;
    end if;
    if cash_received is null or cash_received < sale_total then
      raise exception '受取金額が不足しています'
        using errcode = '22023';
    end if;
    change_due := cash_received - sale_total;
  end if;

  sale_record := jsonb_build_object(
    'id', sale_id,
    'eventId', event_id,
    'userId', actor_id,
    'createdAt', coalesce(nullif(p_sale->>'createdAt', ''), public.app_state_now_iso()),
    'paymentMethod', payment_method,
    'cashReceived', coalesce(to_jsonb(cash_received), 'null'::jsonb),
    'changeDue', coalesce(to_jsonb(change_due), 'null'::jsonb),
    'status', 'completed',
    'total', sale_total,
    'items', sanitized_items,
    'cancelledAt', '',
    'cancelReason', ''
  );

  current_data := jsonb_set(
    current_data,
    '{sales}',
    coalesce(current_data->'sales', '[]'::jsonb) || jsonb_build_array(sale_record),
    true
  );

  update public.app_state
  set data = current_data,
      version = current_version + 1,
      updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

create or replace function public.cancel_sale(p_sale_id text, p_reason text default '未入力')
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_id text := auth.uid()::text;
  current_data jsonb;
  current_version bigint;
  sale_record jsonb;
  sale_index integer;
  sale_created_at timestamptz;
  sale_item jsonb;
  inventory_record jsonb;
  inventory_index integer;
  current_stock integer;
  quantity integer;
begin
  actor_role := public.require_app_state_role(array['admin', 'manager', 'staff'], '販売取消');

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  select (ordinality - 1)::integer, value
  into sale_index, sale_record
  from jsonb_array_elements(coalesce(current_data->'sales', '[]'::jsonb)) with ordinality as sales(value, ordinality)
  where value->>'id' = p_sale_id
  limit 1;

  if sale_record is null or coalesce(sale_record->>'status', '') <> 'completed' then
    raise exception '取消できる販売が見つかりません'
      using errcode = '22023';
  end if;

  if actor_role = 'staff' then
    if sale_record->>'userId' <> actor_id then
      raise exception '自分以外の販売は取消できません'
        using errcode = '42501';
    end if;
    sale_created_at := nullif(sale_record->>'createdAt', '')::timestamptz;
    if now() - sale_created_at > interval '15 minutes' then
      raise exception '販売から15分を過ぎたため取消できません'
        using errcode = '42501';
    end if;
  end if;

  if coalesce((sale_record->>'stockAdjusted')::boolean, true) then
    for sale_item in
      select value from jsonb_array_elements(coalesce(sale_record->'items', '[]'::jsonb)) as items(value)
    loop
      quantity := floor(coalesce(nullif(sale_item->>'quantity', ''), '0')::numeric)::integer;

      select (ordinality - 1)::integer, value
      into inventory_index, inventory_record
      from jsonb_array_elements(coalesce(current_data->'inventories', '[]'::jsonb)) with ordinality as inventories(value, ordinality)
      where value->>'eventId' = sale_record->>'eventId'
        and value->>'variantId' = sale_item->>'variantId'
      limit 1;

      if inventory_record is null then
        raise exception '在庫データが見つかりません'
          using errcode = '22023';
      end if;

      current_stock := floor(coalesce(nullif(inventory_record->>'current', ''), '0')::numeric)::integer;
      current_data := jsonb_set(
        current_data,
        array['inventories', inventory_index::text, 'current'],
        to_jsonb(current_stock + quantity),
        false
      );
    end loop;
  end if;

  sale_record := sale_record || jsonb_build_object(
    'status', 'cancelled',
    'cancelReason', coalesce(nullif(btrim(p_reason), ''), '未入力'),
    'cancelledAt', public.app_state_now_iso()
  );
  current_data := jsonb_set(current_data, array['sales', sale_index::text], sale_record, false);

  update public.app_state
  set data = current_data,
      version = current_version + 1,
      updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

create or replace function public.delete_cancelled_sale(p_sale_id text)
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  current_version bigint;
  sale_record jsonb;
begin
  perform public.require_app_state_role(array['admin', 'manager'], '取消済み販売削除');

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  select value
  into sale_record
  from jsonb_array_elements(coalesce(current_data->'sales', '[]'::jsonb)) as sales(value)
  where value->>'id' = p_sale_id
  limit 1;

  if sale_record is null or coalesce(sale_record->>'status', '') <> 'cancelled' then
    raise exception '削除できる取消済み販売が見つかりません'
      using errcode = '22023';
  end if;

  current_data := jsonb_set(
    current_data,
    '{sales}',
    coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements(coalesce(current_data->'sales', '[]'::jsonb)) as sales(value)
      where value->>'id' <> p_sale_id
    ), '[]'::jsonb),
    true
  );

  update public.app_state
  set data = current_data,
      version = current_version + 1,
      updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

create or replace function public.adjust_inventory(p_event_id text, p_variant_id text, p_amount integer, p_reason text default '未入力')
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id text := auth.uid()::text;
  current_data jsonb;
  current_version bigint;
  inventory_record jsonb;
  inventory_index integer;
  current_stock integer;
  adjustment_record jsonb;
begin
  perform public.require_app_state_role(array['admin', 'manager'], '在庫調整');

  if p_amount is null or p_amount = 0 then
    raise exception '調整数を入力してください'
      using errcode = '22023';
  end if;

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  select (ordinality - 1)::integer, value
  into inventory_index, inventory_record
  from jsonb_array_elements(coalesce(current_data->'inventories', '[]'::jsonb)) with ordinality as inventories(value, ordinality)
  where value->>'eventId' = p_event_id
    and value->>'variantId' = p_variant_id
  limit 1;

  if inventory_record is null then
    raise exception '在庫データが見つかりません'
      using errcode = '22023';
  end if;

  current_stock := floor(coalesce(nullif(inventory_record->>'current', ''), '0')::numeric)::integer;
  if current_stock + p_amount < 0 then
    raise exception '在庫はマイナスにできません'
      using errcode = '22023';
  end if;

  current_data := jsonb_set(
    current_data,
    array['inventories', inventory_index::text, 'current'],
    to_jsonb(current_stock + p_amount),
    false
  );

  adjustment_record := jsonb_build_object(
    'id', 'adj-' || gen_random_uuid()::text,
    'eventId', p_event_id,
    'variantId', p_variant_id,
    'amount', p_amount,
    'reason', coalesce(nullif(btrim(p_reason), ''), '未入力'),
    'userId', actor_id,
    'createdAt', public.app_state_now_iso()
  );
  current_data := jsonb_set(
    current_data,
    '{adjustments}',
    coalesce(current_data->'adjustments', '[]'::jsonb) || jsonb_build_array(adjustment_record),
    true
  );

  update public.app_state
  set data = current_data,
      version = current_version + 1,
      updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

create or replace function public.save_actual_stock(p_event_id text, p_variant_id text, p_actual numeric)
returns table(data jsonb, updated_at timestamptz, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  current_version bigint;
  inventory_record jsonb;
  inventory_index integer;
begin
  perform public.require_app_state_role(array['admin', 'manager'], '実在庫保存');

  select app_state.data, app_state.version
  into current_data, current_version
  from public.app_state
  where id = 'main'
  for update;

  select (ordinality - 1)::integer, value
  into inventory_index, inventory_record
  from jsonb_array_elements(coalesce(current_data->'inventories', '[]'::jsonb)) with ordinality as inventories(value, ordinality)
  where value->>'eventId' = p_event_id
    and value->>'variantId' = p_variant_id
  limit 1;

  if inventory_record is null then
    raise exception '在庫データが見つかりません'
      using errcode = '22023';
  end if;

  current_data := jsonb_set(
    current_data,
    array['inventories', inventory_index::text, 'actual'],
    coalesce(to_jsonb(p_actual), 'null'::jsonb),
    false
  );

  update public.app_state
  set data = current_data,
      version = current_version + 1,
      updated_at = now()
  where id = 'main'
  returning app_state.data, app_state.updated_at, app_state.version
  into data, updated_at, version;

  return next;
end;
$$;

grant execute on function public.app_state_current_role() to authenticated, service_role;
grant execute on function public.can_manage_app_state() to authenticated, service_role;
grant execute on function public.require_app_state_role(text[], text) to authenticated, service_role;
grant execute on function public.app_state_now_iso() to authenticated, service_role;
grant execute on function public.initialize_app_state(jsonb) to authenticated, service_role;
grant execute on function public.save_app_state(jsonb, bigint) to authenticated, service_role;
grant execute on function public.create_sale(jsonb) to authenticated, service_role;
grant execute on function public.cancel_sale(text, text) to authenticated, service_role;
grant execute on function public.delete_cancelled_sale(text) to authenticated, service_role;
grant execute on function public.adjust_inventory(text, text, integer, text) to authenticated, service_role;
grant execute on function public.save_actual_stock(text, text, numeric) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end;
$$;
