# Audit de performance — Tricount Brazil

Date : 14 septembre 2026  
Périmètre : parcours mobile « ouvrir le site → afficher les comptes → ajouter une dépense »  
Version auditée : `v34`, commit `dd22532`

## Verdict

Le délai de deux minutes ne vient pas du volume actuel des comptes ni, directement, du fait d'être au Brésil. Le serveur GitHub Pages est servi depuis Curitiba et répond vite lors de l'audit. La cause la plus probable est le cumul de deux choix d'architecture qui transforment une connexion mobile momentanément mauvaise en écran bloqué :

1. Le service worker demande toujours le HTML au réseau avant d'utiliser sa copie locale, sans délai maximal.
2. Même sur un téléphone déjà autorisé, l'application masque toute l'interface jusqu'à la réponse de vérification Supabase, également sans délai maximal.

Sur une bonne connexion, le parcours complet a été mesuré à 1,36 s. Quand une seule de ces requêtes reste pendante sur un réseau mobile instable, le navigateur peut attendre son propre timeout, souvent proche d'une à deux minutes.

## Étapes auditées

### 1. Navigation vers l'application — santé : mauvaise sur réseau instable

Le service worker applique une stratégie `network-first` aux navigations. La copie locale n'est utilisée qu'après l'échec complet de `fetch(request)`. Aucun `AbortController` ni timeout n'est présent.

Conséquence : le cache installé ne rend pas l'ouverture instantanée. Si le téléphone déclare être en ligne mais que la requête GitHub reste pendante, l'utilisateur attend avant même que l'application puisse démarrer.

### 2. Vérification de l'appareil — santé : critique

`bootstrapAccess()` appelle `lockApp()`, masque l'application, puis attend `verifyAccessCode(storedCode)`. Cette requête Supabase n'a aucun timeout. La copie locale ne s'affiche que si `fetch` finit réellement par lever une erreur.

Conséquence : le téléphone peut posséder le bon code, la validation précédente et les comptes locaux, tout en restant bloqué sur « Vérification… » pendant toute la durée d'un incident réseau.

### 3. Chargement des comptes — santé : correcte aujourd'hui, fragile

Après déverrouillage, un second appel Supabase télécharge l'état partagé complet. Il ne bloque plus l'affichage à ce stade, mais il n'a pas de timeout et peut être déclenché au focus ainsi que toutes les 30 secondes. Le code n'empêche pas deux chargements distants de se chevaucher.

L'état réel actuel est petit : 37 717 octets, 31 dépenses, 11 articles, 3 tâches et aucune photo de ticket. Il n'explique pas un délai de deux minutes.

### 4. Ouverture du formulaire de dépense — santé : moyenne

Quand la devise initiale est le real et que le taux local a expiré, le formulaire attend `getLatestRate()` avant de s'afficher. Le timeout est ici limité à 6,5 s : ce n'est pas la cause des deux minutes, mais le clic peut sembler ne rien faire pendant plusieurs secondes.

Sur la session auditée, l'ouverture du formulaire a pris environ 344 ms quand l'euro était sélectionné.

### 5. Conversion EUR/BRL — santé : bug fonctionnel observé

Le taux n'est calculé qu'une fois avant le premier rendu du formulaire. Si le formulaire s'ouvre en euros puis que l'utilisateur choisit R$, l'interface ne relance pas le chargement et affiche « Taux automatique indisponible ». Pendant l'audit, l'API elle-même répondait correctement en 468 ms avec le taux 5,9704.

### 6. Ressources visuelles et bibliothèques — santé : acceptable, améliorable

Le premier chargement dépend de jsDelivr pour les icônes et la bibliothèque Supabase. La police d'icônes pèse 147 Ko et l'image minérale 373 Ko. Ces ressources peuvent ralentir un premier chargement sur un faible débit, mais elles ne suffisent pas à expliquer deux minutes sur une connexion fonctionnelle.

Les grandes images sociales `tricount-brazil-og.png` et `tricount-brazil-cover.png` ne sont pas téléchargées pendant l'utilisation normale de l'application ; elles ne sont pas responsables du problème.

## Mesures du 14 septembre 2026 depuis Curitiba

| Ressource | TTFB | Temps total | Taille reçue |
|---|---:|---:|---:|
| Page GitHub Pages | 207 ms | 208 ms | 13,8 Ko |
| `app.js` | 217 ms | 230 ms | 123 Ko sans compression curl |
| `styles.css` | 171 ms | 178 ms | 65,9 Ko sans compression curl |
| Image minérale | 188 ms | 208 ms | 373 Ko |
| SDK Supabase via jsDelivr | 751 ms | 766 ms | 131 Ko |
| Police Phosphor | 23 ms | 37 ms | 147 Ko |
| État Supabase | 251 ms | 251 ms | 40,6 Ko brut / 37,7 Ko pour l'état JSON |
| Taux EUR/BRL | 467 ms | 468 ms | 62 octets |

Six vérifications Supabase du code ont pris de 216 ms à 1,143 s. Six lectures de l'état ont pris de 217 ms à 877 ms. GitHub a indiqué l'edge `brazilsouth` / Curitiba et Supabase est passé par Cloudflare Curitiba : le Brésil n'est donc pas la cause géographique principale lors de l'audit.

## Correctifs recommandés, par priorité

### P0 — éliminer les blocages de plusieurs minutes

1. Afficher immédiatement la copie locale pour un appareil déjà vérifié, puis revalider le code en arrière-plan.
2. Passer la navigation du service worker en `cache-first` ou `stale-while-revalidate`, avec mise à jour en arrière-plan.
3. Ajouter des timeouts courts à toutes les requêtes Supabase et conserver l'interface locale utilisable après timeout.
4. Garantir une seule synchronisation distante en vol à la fois.

### P1 — rendre l'ajout instantané

1. Ouvrir le formulaire sans attendre le taux.
2. Afficher le dernier taux local immédiatement, puis le rafraîchir en arrière-plan.
3. Corriger le passage EUR → BRL afin qu'il charge ou réutilise réellement le taux.
4. Précharger le taux après l'affichage de l'application plutôt qu'au clic.

### P2 — alléger et fiabiliser

1. Héberger localement la feuille et la police Phosphor, ou remplacer les icônes nécessaires par un petit jeu SVG local.
2. Charger le SDK Supabase Realtime après le premier rendu, puisqu'il n'est pas nécessaire pour afficher les comptes.
3. Réduire le polling de 30 secondes quand Realtime fonctionne.
4. Convertir l'image minérale en WebP/AVIF et la charger paresseusement sur l'écran de code.
5. Si des tickets sont ajoutés à l'avenir, stocker les fichiers dans Supabase Storage au lieu d'insérer le base64 dans tout l'état JSON.

## Captures

1. `screenshots/01-comptes-charge-mobile.png` — comptes chargés et utilisables.
2. `screenshots/02-ajout-depense-taux-indisponible.png` — formulaire et bug du taux après passage en R$.
3. `screenshots/03-verification-bloquante-au-demarrage.png` — étape qui masque toute l'application pendant la requête de vérification.

## Conclusion

La performance du serveur est bonne au moment de l'audit. Le défaut se situe principalement dans la tolérance aux réseaux mobiles : les données locales et le service worker existent, mais le code attend encore le réseau avant de les exploiter. La première intervention doit donc rendre l'application local-first et borner chaque requête ; cela supprimera le scénario des deux minutes, même si la connexion au Brésil est momentanément mauvaise.
