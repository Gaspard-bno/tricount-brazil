-- Emergency compatibility rollback ONLY if the verified client cannot bootstrap.
-- This restores the OLD PUBLIC-READ exposure for Brazil; prefer fixing the secure
-- RPC/client. It never changes data, code hashes, Marseille, or secure endpoints.
-- The legacy save stays NULL-safe because the additive migration is retained.

begin;

drop policy if exists "Brazil direct access denied" on public.trip_state;
drop policy if exists "Brazil direct event access denied" on public.trip_events;
drop policy if exists "Lecture publique de Tricount Brazil" on public.trip_state;
create policy "Lecture publique de Tricount Brazil"
on public.trip_state for select to anon, authenticated
using (id = 'tricount-brazil-2026');
drop policy if exists "Lecture publique des événements Brazil" on public.trip_events;
create policy "Lecture publique des événements Brazil"
on public.trip_events for select to anon, authenticated
using (trip_id = 'tricount-brazil-2026');

grant execute on function public.verify_brazil_access_code(text) to anon, authenticated;
grant execute on function public.save_brazil_trip_state(text, jsonb, bigint, text, text) to anon, authenticated;

commit;
