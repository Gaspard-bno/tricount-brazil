# Tricount Brazil

Application partagée de gestion de l’appartement de Gaspard et Raphael au
Brésil. Le cœur du produit gère les dépenses BRL/EUR et les remboursements en
euros ; les listes de courses, achats à décider et tâches tournantes complètent
le séjour.

## Application publiée

GitHub Pages sert directement le dossier `docs/` depuis la branche `main` :

<https://gaspard-bno.github.io/tricount-brazil/>

## Développement local

```bash
python3 -m http.server 4173 --directory docs
```

- Application vide : <http://localhost:4173/>
- Données de démonstration locales : <http://localhost:4173/?demo=1>

Le mode démonstration n’est actif que sur `localhost` ou `127.0.0.1`.

## Vérifications

```bash
npm test
node --check docs/app.js
node --check docs/core.js
```

## Données et synchronisation

- Identifiant Brazil : `tricount-brazil-2026`
- Les clés navigateur utilisent exclusivement le préfixe `tricount-brazil-`.
- La ligne historique `marseille-2026` n’est ni modifiée ni supprimée.
- Les modifications partagées passent par une fonction Supabase dédiée avec
  contrôle du code commun et verrouillage optimiste par version.
- Une dépense en reais conserve son montant d’origine, son taux daté et une
  valeur EUR figée. Un débit bancaire réel peut remplacer la conversion de
  référence.

La migration additive a été appliquée en production le 30 août 2026. Son
script idempotent reste disponible dans `supabase-brazil-migration.sql` pour
l’audit et la reprise.

## Documentation de conception

- `design-brief.md` : direction produit et visuelle.
- `MIGRATION-PLAN.md` : garanties de migration et retour arrière.
- `design-qa.md` : comparaison visuelle et audit final.
