# Migration plan

1. Keep the repository history and the existing GitHub Pages source
   (`main/docs`).
2. Preserve the `marseille-2026` Supabase row and all `marseille26-*` browser
   keys without modification.
3. Add the isolated row `tricount-brazil-2026`, copying only the existing
   access-code hash so the same four-digit code remains valid.
4. Add a Brazil-only optimistic-write RPC; do not broaden write access to
   other trip identifiers.
5. Use only `tricount-brazil-*` local cache, pending-sync and preference keys.
6. Replace the served UI with the new single-page application while keeping
   `comptes.html` and `budget.html` as compatibility entry points.
7. Test locally, apply the additive database migration, verify remote isolation,
   then fast-forward `main` and verify the public GitHub Pages URL.

Rollback remains recoverable through Git history. The database migration is
additive; rollback of the interface does not require deleting either trip row.
