# Guide projet pour Codex et Claude

Lire dans cet ordre : `PRODUCT.md`, `DESIGN.md`, `PERFORMANCE.md`, puis `MASTER-ACTION-PLAN-2026-09-14.md`.

## Règles

- Préserver les données réelles et la ligne Marseille.
- Gaspard et Raphael sont les noms permanents.
- Ne pas ajouter de quatrième destination principale.
- Priorité au téléphone, à la rapidité et au fonctionnement hors ligne.
- Ne jamais réintroduire une lecture Supabase directe de `trip_state`.
- Toute requête doit être bornée par timeout et toute mutation doit survivre à une perte réseau.
- Une photo de ticket ne doit pas grossir l'état partagé sans limite.
- Valider par `npm run check`, le build, les tests de sécurité et une vérification visuelle mobile/ordinateur avant publication.

## Publication

GitHub Pages sert `docs/` depuis `main`. Ne publier que si les contrôles passent et que la lecture anonyme de l'état Brazil est refusée. Conserver une sauvegarde d'état externe avant toute migration Supabase.
