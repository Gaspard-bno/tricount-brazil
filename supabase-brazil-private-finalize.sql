-- Tricount Brazil · phase 2, AFTER the new Pages client is verified in production.
-- Add restrictive guards: these also defeat unknown legacy permissive/all-row
-- policies, while leaving every other trip's existing policies and grants intact.
-- SECURITY DEFINER RPCs bypass RLS as the table owner; direct clients cannot.

begin;

do $$
begin
  if to_regprocedure('public.bootstrap_brazil_trip(text)') is null
    or to_regprocedure('public.save_brazil_trip_state_secure(text,jsonb,bigint,text,text)') is null then
    raise exception 'Install the additive Brazil bootstrap migration first';
  end if;
end;
$$;

alter table public.trip_state enable row level security;
alter table public.trip_events enable row level security;

drop policy if exists "Lecture publique de Tricount Brazil" on public.trip_state;
drop policy if exists "Lecture publique des événements Brazil" on public.trip_events;
drop policy if exists "Brazil direct access denied" on public.trip_state;
create policy "Brazil direct access denied"
on public.trip_state as restrictive for all to anon, authenticated
using (id <> 'tricount-brazil-2026')
with check (id <> 'tricount-brazil-2026');
drop policy if exists "Brazil direct event access denied" on public.trip_events;
create policy "Brazil direct event access denied"
on public.trip_events as restrictive for all to anon, authenticated
using (trip_id <> 'tricount-brazil-2026')
with check (trip_id <> 'tricount-brazil-2026');

revoke all on function public.verify_brazil_access_code(text) from public, anon, authenticated;
revoke all on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) from public, anon, authenticated;

commit;
