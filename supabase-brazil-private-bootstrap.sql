-- Tricount Brazil · phase 1 / additive, safe before the new client is published.
-- Preserves every trip_state row and Marseille function/policy.
-- JSON errors are intentional: raising an exception would roll back the failed-
-- attempt counter together with the transaction. No secret is embedded here.

begin;

create schema if not exists tricount_private;
revoke all on schema tricount_private from public, anon, authenticated;

create table if not exists tricount_private.brazil_access_attempts (
  client_hash text primary key,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);
alter table tricount_private.brazil_access_attempts enable row level security;
revoke all on tricount_private.brazil_access_attempts from public, anon, authenticated;

create or replace function tricount_private.check_brazil_access(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  headers jsonb;
  edge_ip text;
  client_key text;
  attempts tricount_private.brazil_access_attempts;
  saved_hash text;
  valid boolean;
  checked_at timestamptz := clock_timestamp();
begin
  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  -- Supabase's edge normally supplies these. This is a best-effort IP throttle,
  -- not identity/authentication; a PIN is still only a shared four-digit code.
  edge_ip := coalesce(nullif(headers ->> 'cf-connecting-ip', ''), nullif(headers ->> 'x-real-ip', ''));
  if edge_ip is not null then
    client_key := encode(extensions.digest(edge_ip, 'sha256'), 'hex');
    delete from tricount_private.brazil_access_attempts
    where window_started_at < checked_at - interval '1 day'
      and coalesce(blocked_until, checked_at) <= checked_at;
    insert into tricount_private.brazil_access_attempts (client_hash)
    values (client_key) on conflict (client_hash) do nothing;
    select * into attempts from tricount_private.brazil_access_attempts
    where client_hash = client_key for update;
    if attempts.blocked_until > checked_at then
      return jsonb_build_object('error', 'RATE_LIMITED', 'retry_after_seconds',
        greatest(1, ceil(extract(epoch from attempts.blocked_until - checked_at))::integer));
    end if;
    if attempts.window_started_at <= checked_at - interval '5 minutes'
       or attempts.blocked_until is not null then
      update tricount_private.brazil_access_attempts
      set failed_attempts = 0, window_started_at = checked_at, blocked_until = null
      where client_hash = client_key returning * into attempts;
    end if;
  end if;

  select access_code_hash into saved_hash from public.trip_state
  where id = 'tricount-brazil-2026';
  if saved_hash is null then
    return jsonb_build_object('error', 'TRIP_NOT_FOUND');
  end if;
  valid := p_access_code is not null
    and length(p_access_code) between 1 and 128
    and extensions.crypt(p_access_code, saved_hash) is not distinct from saved_hash;
  if valid then
    if client_key is not null then
      update tricount_private.brazil_access_attempts
      set failed_attempts = 0, window_started_at = checked_at, blocked_until = null
      where client_hash = client_key;
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if client_key is not null then
    update tricount_private.brazil_access_attempts
    set failed_attempts = failed_attempts + 1,
        blocked_until = case when failed_attempts + 1 >= 8
          then checked_at + interval '2 minutes' else null end
    where client_hash = client_key;
  end if;
  return jsonb_build_object('error', 'INVALID_ACCESS_CODE');
end;
$$;
revoke all on function tricount_private.check_brazil_access(text) from public, anon, authenticated;

create or replace function public.bootstrap_brazil_trip(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  access_result jsonb;
  result jsonb;
begin
  access_result := tricount_private.check_brazil_access(p_access_code);
  if access_result ->> 'error' is not null then return access_result; end if;
  select jsonb_build_object(
    'state', state, 'version', version, 'updated_at', updated_at, 'updated_by', updated_by
  ) into result from public.trip_state where id = 'tricount-brazil-2026';
  return coalesce(result, jsonb_build_object('error', 'TRIP_NOT_FOUND'));
end;
$$;
revoke all on function public.bootstrap_brazil_trip(text) from public;
grant execute on function public.bootstrap_brazil_trip(text) to anon, authenticated;

create or replace function public.save_brazil_trip_state_secure(
  p_access_code text,
  p_state jsonb,
  p_expected_version bigint,
  p_actor text,
  p_event_type text default 'Mise à jour'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  access_result jsonb;
  current_row public.trip_state;
  saved_row public.trip_state;
  collection_name text;
begin
  access_result := tricount_private.check_brazil_access(p_access_code);
  if access_result ->> 'error' is not null then return access_result; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or p_state ->> 'tripId' is distinct from 'tricount-brazil-2026'
    or jsonb_typeof(p_state -> 'preferences') is distinct from 'object' then
    return jsonb_build_object('error', 'INVALID_STATE');
  end if;
  foreach collection_name in array array[
    'members', 'spaces', 'expenses', 'settlements', 'shoppingItems',
    'purchaseIdeas', 'tasks', 'recurringExpenses', 'activity'
  ] loop
    if jsonb_typeof(p_state -> collection_name) is distinct from 'array' then
      return jsonb_build_object('error', 'INVALID_STATE');
    end if;
  end loop;
  if pg_column_size(p_state) > 5242880 then
    return jsonb_build_object('error', 'STATE_TOO_LARGE');
  end if;
  select * into current_row from public.trip_state
  where id = 'tricount-brazil-2026' for update;
  if current_row.id is null then return jsonb_build_object('error', 'TRIP_NOT_FOUND'); end if;
  if p_expected_version is distinct from current_row.version then
    return jsonb_build_object('error', 'CONFLICT_VERSION', 'version', current_row.version);
  end if;
  update public.trip_state
  set state = p_state, version = version + 1, updated_at = now(),
      updated_by = left(nullif(trim(p_actor), ''), 80)
  where id = 'tricount-brazil-2026' returning * into saved_row;
  insert into public.trip_events (trip_id, event_type, actor, payload)
  values ('tricount-brazil-2026',
    left(coalesce(nullif(trim(p_event_type), ''), 'Mise à jour'), 120),
    left(nullif(trim(p_actor), ''), 80), jsonb_build_object('version', saved_row.version));
  return jsonb_build_object('state', saved_row.state, 'version', saved_row.version,
    'updated_at', saved_row.updated_at, 'updated_by', saved_row.updated_by);
end;
$$;
revoke all on function public.save_brazil_trip_state_secure(text, jsonb, bigint, text, text) from public;
grant execute on function public.save_brazil_trip_state_secure(text, jsonb, bigint, text, text) to anon, authenticated;

-- Keep the legacy endpoints temporarily compatible for old cached clients, while
-- closing NULL-code/NULL-version bypasses and removing the hash from responses.
create or replace function public.verify_brazil_access_code(p_access_code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return coalesce((tricount_private.check_brazil_access(p_access_code) ->> 'ok')::boolean, false);
end;
$$;

create or replace function public.save_brazil_trip_state(
  p_access_code text, p_state jsonb, p_expected_version bigint, p_actor text,
  p_event_type text default 'Mise à jour'
)
returns public.trip_state
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
  legacy_row public.trip_state;
begin
  result := public.save_brazil_trip_state_secure(p_access_code, p_state, p_expected_version, p_actor, p_event_type);
  if result ->> 'error' is not null then
    -- Legacy clients expect HTTP errors. Phase 2 revokes this endpoint so failed
    -- attempts can no longer roll back their counter through the compatibility path.
    raise exception '%', result ->> 'error';
  end if;
  legacy_row.id := 'tricount-brazil-2026';
  legacy_row.state := result -> 'state';
  legacy_row.version := (result ->> 'version')::bigint;
  legacy_row.updated_at := (result ->> 'updated_at')::timestamptz;
  legacy_row.updated_by := result ->> 'updated_by';
  legacy_row.access_code_hash := null;
  return legacy_row;
end;
$$;
revoke all on function public.verify_brazil_access_code(text) from public;
revoke all on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) from public;
grant execute on function public.verify_brazil_access_code(text) to anon, authenticated;
grant execute on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) to anon, authenticated;

commit;
