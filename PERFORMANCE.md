# Tricount Brazil — performance et synchronisation

## Budgets

- Retour sur appareil connu : interface disponible sous 300 ms au p75.
- Réseau disponible : synchronisation ou revalidation sous 800 ms au p75.
- Formulaire Dépense visible sous 100 ms.
- LCP inférieur à 2,5 s, INP inférieur à 200 ms, CLS inférieur à 0,05.
- Ressources critiques sous 300 Ko et aucune dépendance distante bloquante.

## Principes

- Afficher l'état local en premier sur appareil précédemment vérifié.
- Chaque requête distante possède un timeout explicite.
- Une synchronisation à la fois, avec file locale, fusion optimiste et retry progressif.
- Le taux BRL/EUR est caché ; sa mise à jour n'empêche jamais d'ouvrir une dépense.
- Le service worker répond depuis le cache pour le shell, met à jour en arrière-plan et ne met jamais l'API Supabase en cache.
- Les lectures de l'état partagé passent par un RPC contrôlé par code ; aucune lecture de table publique.
