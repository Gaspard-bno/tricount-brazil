# QA redesign v34 — 30 août 2026

## Direction retenue

- Mix validé : 70 % Night Ledger, 30 % Brazil Signal.
- Navigation principale réduite à Comptes, Listes et Tâches.
- Action d’ajout contextuelle : dépense, article/achat ou tâche selon la section ouverte.
- Texture minérale Higgsfield réelle intégrée au solde et à l’écran d’accès.
- Interface sombre, structurée, contrastée, avec accents jaune, vert et bleu.

## Accès

- L’interface complète reste masquée avant validation du code.
- Le code est vérifié par la fonction Supabase `verify_brazil_access_code`.
- Un mauvais code laisse l’utilisateur sur l’écran d’accès.
- Après une validation correcte, le code est mémorisé localement et n’est plus demandé au rechargement.
- Aucun code en clair n’est présent dans les fichiers publics.

## Dépenses

- Date et catégorie sont les deux premiers champs visibles.
- Titre, montant, devise et taux viennent ensuite.
- Payeur et participants disposent de boutons directs.
- Note et photo du ticket sont explicitement regroupées comme facultatives.
- Les dépenses desktop utilisent un tableau continu : date, dépense, payeur, BRL d’origine et EUR figé.
- Le filtre de période est un sélecteur compact couvrant aujourd’hui, hier, semaine, mois courant, depuis le début et août à décembre.

## Contrôles effectués

- 15 tests automatisés réussis.
- ESLint, syntaxe JavaScript et `git diff --check` réussis.
- Mauvais code testé : accès refusé.
- Bon code testé : accès autorisé.
- Rechargement testé : pas de nouvelle demande du code.
- Écran d’accès desktop et mobile contrôlé visuellement.
- Comptes, Listes et Tâches contrôlés à 390 × 844.
- Formulaire de dépense contrôlé en haut, au milieu et sur les champs facultatifs.
- Largeur mobile : `scrollWidth = innerWidth = 390`.
- Console du navigateur : aucune erreur.

## Références

- Cible choisie : `refs/redesign-concepts/selected-mix-final.png`
- Capture du build : `refs/redesign-audit/07-accounts-desktop-v33.png`
- Comparaison : `refs/redesign-audit/08-reference-vs-build-v33.png`
