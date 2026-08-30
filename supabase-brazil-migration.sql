-- Tricount Brazil · migration additive
-- This script never updates or deletes the marseille-2026 state.

begin;

insert into public.trip_state (id, state, version, access_code_hash, updated_by)
select
  'tricount-brazil-2026',
  jsonb_build_object(
    'schemaVersion', 3,
    'tripId', 'tricount-brazil-2026',
    'members', jsonb_build_array(
      jsonb_build_object('id', 'gaspard', 'name', 'Gaspard', 'initial', 'G', 'type', 'resident', 'color', 'yellow'),
      jsonb_build_object('id', 'raphael', 'name', 'Raphael', 'initial', 'R', 'type', 'resident', 'color', 'blue')
    ),
    'spaces', jsonb_build_array(
      jsonb_build_object(
        'id', 'apartment',
        'name', 'Appartement',
        'type', 'apartment',
        'status', 'open',
        'currency', 'BRL',
        'memberIds', jsonb_build_array('gaspard', 'raphael')
      )
    ),
    'expenses', jsonb_build_array(),
    'settlements', jsonb_build_array(),
    'shoppingItems', jsonb_build_array(),
    'purchaseIdeas', jsonb_build_array(),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'task-laundry', 'title', 'Machine à laver', 'type', 'rotating', 'assigneeId', 'gaspard', 'recurrence', 'as-needed', 'completed', false, 'archived', false, 'completions', jsonb_build_array()),
      jsonb_build_object('id', 'task-trash', 'title', 'Descendre les poubelles', 'type', 'rotating', 'assigneeId', 'raphael', 'recurrence', 'as-needed', 'completed', false, 'archived', false, 'completions', jsonb_build_array()),
      jsonb_build_object('id', 'task-cleaning', 'title', 'Ménage de l''appartement', 'type', 'rotating', 'assigneeId', 'gaspard', 'recurrence', 'as-needed', 'completed', false, 'archived', false, 'completions', jsonb_build_array())
    ),
    'recurringExpenses', jsonb_build_array(),
    'activity', jsonb_build_array(),
    'preferences', jsonb_build_object(
      'lastPayerId', 'gaspard',
      'lastCurrency', 'BRL',
      'settlementThreshold', 20,
      'theme', 'dark',
      'listNotifications', false,
      'taskNotifications', false,
      'settlementNotifications', false,
      'favoriteShopping', jsonb_build_array('Café', 'Lessive', 'Papier toilette', 'Eau'),
      'recentExpenseLabels', jsonb_build_array()
    )
  ),
  1,
  access_code_hash,
  'Initialisation Tricount Brazil'
from public.trip_state
where id = 'marseille-2026'
on conflict (id) do nothing;

drop policy if exists "Lecture publique de Tricount Brazil" on public.trip_state;
create policy "Lecture publique de Tricount Brazil"
on public.trip_state for select
to anon, authenticated
using (id = 'tricount-brazil-2026');

drop policy if exists "Lecture publique des événements Brazil" on public.trip_events;
create policy "Lecture publique des événements Brazil"
on public.trip_events for select
to anon, authenticated
using (trip_id = 'tricount-brazil-2026');

create or replace function public.save_brazil_trip_state(
  p_access_code text,
  p_state jsonb,
  p_expected_version bigint,
  p_actor text,
  p_event_type text default 'Mise à jour'
)
returns public.trip_state
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_row public.trip_state;
  saved_row public.trip_state;
begin
  if p_state is null
     or jsonb_typeof(p_state) <> 'object'
     or p_state ->> 'tripId' <> 'tricount-brazil-2026' then
    raise exception 'État invalide';
  end if;

  if pg_column_size(p_state) > 5242880 then
    raise exception 'Le carnet dépasse la taille autorisée';
  end if;

  select * into current_row
  from public.trip_state
  where id = 'tricount-brazil-2026'
  for update;

  if current_row.id is null then
    raise exception 'Séjour introuvable';
  end if;

  if extensions.crypt(p_access_code, current_row.access_code_hash) <> current_row.access_code_hash then
    raise exception 'Code de groupe incorrect';
  end if;

  if p_expected_version <> current_row.version then
    raise exception 'CONFLICT_VERSION';
  end if;

  update public.trip_state
  set state = p_state,
      version = version + 1,
      updated_at = now(),
      updated_by = left(nullif(trim(p_actor), ''), 80)
  where id = 'tricount-brazil-2026'
  returning * into saved_row;

  insert into public.trip_events (trip_id, event_type, actor, payload)
  values (
    'tricount-brazil-2026',
    left(coalesce(nullif(trim(p_event_type), ''), 'Mise à jour'), 120),
    left(nullif(trim(p_actor), ''), 80),
    jsonb_build_object('version', saved_row.version)
  );

  return saved_row;
end;
$$;

revoke all on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) from public;
grant execute on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) to anon, authenticated;

commit;
