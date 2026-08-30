-- Tricount Brazil · vérification du code avant affichage de l'interface
-- Migration additive : aucune donnée Marseille ou Brazil n'est modifiée.

begin;

create or replace function public.verify_brazil_access_code(p_access_code text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    extensions.crypt(coalesce(p_access_code, ''), access_code_hash) = access_code_hash,
    false
  )
  from public.trip_state
  where id = 'tricount-brazil-2026';
$$;

revoke all on function public.verify_brazil_access_code(text) from public;
grant execute on function public.verify_brazil_access_code(text) to anon, authenticated;

commit;
