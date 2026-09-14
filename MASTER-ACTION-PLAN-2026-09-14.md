---
type: master-action-plan
project: Tricount Brazil
status: ready-for-go
date: 2026-09-14
target_score: 94/100
publication_gate: 90/100
---

# Tricount Brazil — Master Action Plan

## 1. Résultat attendu

Transformer l'application existante en plateforme de gestion de vacances mobile-first, instantanée et fiable, avec le tricount comme fonction principale, sans changer son adresse publique :

<https://gaspard-bno.github.io/tricount-brazil/>

Le build final doit :

- rendre l'interface locale utilisable immédiatement, même si le réseau brésilien est lent ou absent ;
- conserver GitHub Pages, Supabase, le code commun `2006` et la mémorisation du code sur l'appareil ;
- empêcher la lecture directe des données Supabase sans le code ;
- améliorer profondément les parcours Dépense, Listes et Tâches sans créer une application surchargée ;
- préserver les vraies données actuelles de Gaspard et Raphael ;
- atteindre au moins 90/100 selon la grille de ce document, avec une cible de 94/100 ;
- être testée localement puis en production avant d'être déclarée terminée.

## 2. Contraintes produit verrouillées

- Utilisateurs permanents : `Gaspard` et `Raphael`, orthographe exacte.
- Contexte : appartement au Brésil, pas maison.
- Navigation principale : `Comptes`, `Listes`, `Tâches`.
- Types d'ajout : `Dépense`, `À acheter`, `Tâche`.
- Aucun onglet Programme, Moment ou Accueil.
- Invités temporaires autorisés dans les dépenses, sans transformer l'application en gestionnaire de groupe complexe.
- Remboursements toujours calculés en euros.
- Dépenses saisissables en BRL ou EUR ; taux daté et valeur EUR figée, avec correction manuelle possible.
- Photo et note facultatives ; date et catégorie présentes dans le premier niveau du formulaire.
- Avatars : initiale dans un cercle à dégradé, jamais de photo de profil.
- Style : sombre, iOS/Linear, calme et premium ; accents brésiliens jaune, vert et bleu utilisés avec retenue.
- Mobile prioritaire, ordinateur pleinement supporté.
- Aucun changement d'URL, aucune démarche supplémentaire demandée à Gaspard pendant l'exécution normale.

## 3. Diagnostic de départ

### Causes de la lenteur

1. Le service worker utilise une navigation `network-first` sans délai maximal. Quand la connexion répond mal, le cache local attend l'échec réseau complet avant de prendre le relais.
2. Le démarrage reverrouille toujours l'application et attend la validation Supabase du code, même sur un téléphone déjà validé.
3. Les lectures Supabase n'ont pas de délai maximal et peuvent se chevaucher au focus et pendant le polling.
4. Le formulaire de dépense attend parfois le taux BRL/EUR avant de se rendre visible.
5. Le passage EUR → BRL après ouverture du formulaire ne recharge pas correctement le taux.
6. Le chemin critique charge un SDK distant, une police d'icônes distante et une grande image avant ou autour de l'usage initial.

Les mesures depuis Curitiba montrent que GitHub Pages et Supabase répondent normalement lorsque le réseau est stable. Le Brésil n'est donc pas la cause racine : le problème vient surtout de l'architecture d'attente et de l'absence de garde-fous réseau.

### Risque de confidentialité

La politique RLS actuelle autorise la lecture anonyme de la ligne Brazil. Le verrouillage par code masque l'interface mais ne protège pas réellement les données contre une requête REST directe. La correction est obligatoire avant la note finale.

### État fonctionnel

- Données actuelles légères : environ 38 Ko, 31 dépenses, 11 articles, 3 tâches, 0 reçu au moment de l'audit.
- 15 tests existants réussissent.
- Audit npm : aucune vulnérabilité connue.
- Le volume de données n'explique pas les attentes de deux minutes.

## 4. Grille de notation

| Dimension | Poids | Avant | Cible après |
|---|---:|---:|---:|
| Performance et résilience mobile | 25 | 9 | 23 |
| Ergonomie et efficacité mobile | 20 | 14 | 19 |
| Fonctionnalités utiles | 15 | 14 | 15 |
| UI, identité et animations | 15 | 11 | 14 |
| Synchronisation et intégrité des données | 10 | 7 | 9 |
| Accessibilité | 8 | 7 | 8 |
| Sécurité et confidentialité | 7 | 2 | 6 |
| **Total** | **100** | **64/100** | **94/100** |

La note cible est une projection contractuelle, pas une note acquise. La note finale sera recalculée après mesures et contrôle de la version publique. La publication n'est acceptée que si le total atteint 90/100 minimum et si aucun problème critique de données, sécurité, accessibilité ou démarrage ne subsiste.

## 5. Décision d'architecture

### Ce qui reste

- URL GitHub Pages actuelle.
- Supabase comme stockage synchronisé.
- Application web installable/PWA.
- JavaScript léger sans migration React/Next.
- Compatibilité avec les données et les clés locales existantes.

### Ce qui change

- Source modulaire sous `src/`, build Vite minimal et déterministe vers `docs/`.
- Cache local affiché d'abord, réseau utilisé pour revalidation et synchronisation.
- Petit service worker maîtrisé, avec shell cache-first/stale-while-revalidate et délais réseau bornés.
- Chargement différé de la synchronisation avancée et suppression des dépendances tierces critiques.
- Sous-ensemble local d'icônes Phosphor, sans police/CDN globale.
- Modules séparés : démarrage, stockage local, client Supabase, synchronisation, comptes, taux, listes, tâches, UI, navigation, animations.
- Un seul appel de bootstrap sécurisé pour vérifier le code et charger l'état distant.

### Ce qui n'est pas retenu

- Pas de reconstruction hébergée par Higgsfield : elle créerait une seconde architecture et une autre chaîne de déploiement.
- Pas de framework SPA lourd ni de bibliothèque d'animation par défaut.
- Pas de webfont, de vidéo de fond, de carrousel ou d'image IA lourde dans le chemin critique.
- Pas de compte utilisateur Supabase complet pour un usage à deux sur trois mois.
- Pas de copie massive des centaines de skills Claude dans Codex.

## 6. Plan d'exécution en un seul GO

### Phase 0 — Sécuriser l'intervention

- Vérifier branche, remote, état Git et configuration Pages.
- Créer une branche `codex/performance-ui-v3` et un point de retour avant toute modification.
- Exporter l'état Supabase Brazil dans une sauvegarde horodatée hors des fichiers publics et hors Git.
- Conserver une copie du build `docs/` courant pour retour arrière immédiat.
- Ne jamais modifier ni supprimer la ligne historique Marseille.
- Photographier les vues principales mobile et ordinateur pour comparaison.

### Phase 1 — Verrouiller le contexte durable du projet

Créer et maintenir :

- `PRODUCT.md` : utilisateurs, jobs-to-be-done, parcours, décisions et non-objectifs ;
- `DESIGN.md` : tokens, typographie, composants, densité, responsive, mouvement et états ;
- `PERFORMANCE.md` : budgets, cache, timeout, synchronisation et métriques ;
- `AGENTS.md` : ordre de lecture, contraintes, commandes de validation et protocole de publication.

Ces fichiers doivent rendre Codex et Claude autonomes sur le même projet sans recharger tout le Personal Brain.

### Phase 2 — Poser les tests avant les corrections

Ajouter des tests qui doivent échouer avec l'ancienne architecture puis passer avec la nouvelle :

- démarrage local-first avec code déjà mémorisé ;
- timeout de validation, de lecture, d'écriture et de taux ;
- impossibilité d'avoir deux synchronisations concurrentes ;
- stratégie du service worker et fallback hors ligne immédiat ;
- bascule EUR → BRL et taux mis à jour ;
- conversion BRL/EUR, arrondis et valeur EUR figée ;
- accès correct avec `2006` et refus avec tout autre code ;
- absence de politique SQL de lecture anonyme ;
- conservation exacte de Gaspard et Raphael ;
- navigation, formulaires, filtres de période, invités, listes et rotation des tâches ;
- non-régression de la fusion optimiste existante.

### Phase 3 — Migration Supabase additive et sans interruption

1. Créer une fonction `security definer` de bootstrap prenant le code et retournant uniquement `state`, `version`, `updated_at` et `updated_by` si le code est valide.
2. Fixer explicitement le `search_path`, révoquer les droits implicites inutiles et accorder seulement l'exécution prévue.
3. Garder temporairement la lecture actuelle pendant le déploiement du nouveau client.
4. Faire passer toutes les lectures du client par la fonction sécurisée.
5. Vérifier le site publié et les écritures avec verrouillage de version.
6. Révoquer ensuite la politique anonyme `SELECT` pour Brazil et les lectures directes associées.
7. Prouver qu'une requête REST anonyme ne renvoie plus l'état, alors que l'application avec le bon code fonctionne.

Le code à quatre chiffres ne devient pas une authentification bancaire : la cible sécurité reste donc 6/7. La protection minimale obligatoire est l'absence de lecture directe et la limitation des tentatives côté interface/serveur lorsque possible sans ajouter une infrastructure disproportionnée.

### Phase 4 — Démarrage instantané et mode hors ligne

- Si l'appareil possède un accès déjà validé, afficher immédiatement le dernier état local et le shell, sans écran bloquant.
- Revalider le code et actualiser les données en arrière-plan.
- Sur nouvel appareil, afficher le verrou et utiliser le bootstrap sécurisé avec timeout court, retry explicite et message hors ligne utile.
- Ajouter un état discret : `À jour`, `Synchronisation…`, `Hors ligne`, `À envoyer`, `Conflit résolu`.
- Mettre les opérations locales en file d'attente, les appliquer optimistement, puis les pousser au retour réseau.
- Garantir une seule requête de synchronisation en vol, avec backoff exponentiel et fusion par version.
- Synchroniser au focus/retour de visibilité et selon un rythme adaptatif ; aucun polling agressif permanent.
- Ne jamais bloquer l'interface à cause d'une lecture distante.

### Phase 5 — Service worker fiable

- Précacher le shell versionné et les actifs indispensables.
- Utiliser cache-first pour les actifs immuables et stale-while-revalidate pour le shell.
- Utiliser network-first seulement pour les ressources qui l'exigent, avec timeout court et fallback contrôlé.
- Éviter de mettre les appels Supabase sensibles dans le cache HTTP du service worker.
- Nettoyer les anciens caches par version.
- Afficher un message non bloquant lorsqu'une nouvelle version est prête, puis l'activer proprement.
- Tester installation, mise à jour, retour en ligne, mode avion et réseau très lent.

### Phase 6 — Chemin critique inférieur à 300 Ko

- Remplacer la police d'icônes distante par le sous-ensemble SVG réellement utilisé.
- Retirer le SDK Supabase du démarrage ; utiliser `fetch` pour REST/RPC et ne charger une couche temps réel qu'après affichage si elle reste nécessaire.
- Compresser et redimensionner les images ; employer AVIF/WebP avec dimensions explicites.
- Garder l'image décorative hors du premier rendu mobile ou fournir une variante très légère.
- Découper et minifier le JavaScript ; différer les modules non nécessaires à l'onglet courant.
- Éliminer les ressources bloquantes, doublons et fichiers du starter Sites qui ne participent pas à GitHub Pages, après confirmation par recherche.

### Phase 7 — Nouveau parcours Dépense

Le bouton central ouvre la feuille en moins de 100 ms. Sur téléphone, le premier écran contient :

- montant et monnaie ;
- titre ;
- date ;
- catégorie ;
- résumé compact du payeur et du partage ;
- bouton d'enregistrement toujours accessible.

Comportement :

- le taux en cache s'affiche immédiatement ; son actualisation est asynchrone ;
- aucune panne de taux ne bloque la saisie ;
- le taux, sa date et la valeur EUR sont visibles et modifiables ;
- le dernier payeur et le partage 50/50 servent de valeurs intelligentes ;
- payeur, partage personnalisé et invités restent accessibles sans encombrer le premier écran ;
- note et photo sont facultatives sous une section progressive clairement nommée ;
- photo compressée avant envoi et stockée hors de l'état JSON si cette fonction est effectivement utilisée ;
- possibilité de dupliquer une dépense récente ;
- confirmation courte, vibration si disponible et option Annuler après ajout.

### Phase 8 — Refonte Comptes

- Réduire le hero sur petit téléphone tout en gardant le solde comme information numéro un.
- Afficher immédiatement qui doit combien à qui et un CTA de remboursement clair.
- Regrouper les détails financiers dans un panneau dépliable.
- Rendre les dépenses compactes par défaut, avec détail à la demande.
- Ajouter recherche et filtres : Aujourd'hui, Hier, Cette semaine, Ce mois-ci, Depuis le début, puis mois précis d'août à décembre.
- Permettre filtrage par personne, invité, catégorie et monnaie sans créer une barre complexe.
- Ajouter accès rapide à Dupliquer, Modifier, Supprimer/Annuler avec protection contre les erreurs.
- Afficher un mini-bilan de période et des catégories seulement à la demande.
- Garder l'historique des remboursements lisible et réversible.

### Phase 9 — Refonte Listes

- Ajout en une ligne, clavier immédiatement prêt, catégorie facultative.
- Séparer clairement Courses et Achats à décider dans le même espace.
- Grouper les courses par catégorie, sans imposer une organisation lourde.
- Suggestions issues des derniers articles, sans intelligence artificielle ni serveur supplémentaire.
- Cocher en un geste, avec Annuler et nettoyage des éléments terminés.
- Transformer un article acheté en dépense préremplie : titre, catégorie et éventuel montant.
- Conserver les éléments terminés repliés plutôt que de les supprimer immédiatement.

### Phase 10 — Refonte Tâches tournantes

- Mettre en avant les routines : machines, poubelles, ménage, plus les tâches ajoutées librement.
- Afficher `Au tour de Gaspard` ou `Au tour de Raphael` de façon impossible à manquer.
- Un grand bouton `Fait` enregistre l'action puis affecte automatiquement la prochaine occurrence à l'autre personne.
- Montrer juste après validation qui est le prochain, avec option Annuler.
- Conserver un historique replié et un compteur équilibré, sans gamification infantile.
- Autoriser fréquence/échéance simples uniquement si elles améliorent une vraie routine ; ne pas devenir un gestionnaire de projet.

### Phase 11 — Navigation et ergonomie globale

- Garder trois onglets fixes et un bouton d'action contextuel.
- Préserver la position de scroll et les filtres de chaque onglet.
- Respecter les safe areas iOS, le clavier virtuel, le geste retour et la zone du pouce.
- Cibles tactiles de 44 px minimum et aucune action essentielle dépendante du hover.
- Utiliser des feuilles basses sur mobile et des panneaux/modales contenus sur ordinateur.
- Uniformiser les états vide, chargement, succès, erreur, hors ligne, conflit et permission.
- Ajouter paramètres, export JSON/CSV et sauvegarde manuelle sans leur donner un onglet principal.
- Prévoir l'installation PWA et une icône cohérente, mais sans bannière agressive.

### Phase 12 — Système visuel

- Fond presque noir teinté, surfaces hiérarchisées, bordures fines et contraste maîtrisé.
- Jaune pour action/attention, vert pour validation/positif, bleu pour information/synchronisation.
- Dégradés uniquement sur avatars, focus majeur et quelques signaux identitaires.
- Typographie système Apple/Inter-compatible, chiffres tabulaires pour les montants.
- Moins de cartes imbriquées, plus d'espacement et de hiérarchie.
- Rayons modérés, ombres diffuses et reflets très limités.
- Aucun cliché touristique ; un éventuel visuel généré doit évoquer la lumière/minéralité brésilienne de manière abstraite et être exporté léger.

### Phase 13 — Mouvement

- CSS/WAAPI et View Transitions en amélioration progressive ; aucune dépendance d'animation lourde par défaut.
- Feedback tactiles : 120–180 ms.
- Feuilles, panneaux et changement d'onglet : 180–240 ms.
- Courbe principale : `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animer seulement `transform` et `opacity` dans les parcours fréquents.
- Interdire `transition: all`, les animations permanentes et les effets qui déplacent la mise en page.
- Stagger discret de 30–50 ms seulement lorsqu'il clarifie une apparition.
- Respect intégral de `prefers-reduced-motion`.
- Les animations ne doivent jamais retarder une saisie, un bouton ou l'accès aux données.

### Phase 14 — Accessibilité et robustesse

- HTML sémantique, titres cohérents, labels réels et descriptions d'erreur associées.
- Navigation clavier complète et focus visible.
- Contraste WCAG AA minimum, y compris accents sur noir.
- Modales avec focus trap, restauration du focus et fermeture accessible.
- Zones tactiles, tailles de texte et zoom iOS vérifiés.
- Formats monétaires et dates annoncés correctement aux lecteurs d'écran.
- États de synchronisation dans une zone live non envahissante.
- Test de texte agrandi, mode réduit, mode sombre forcé et écran étroit.

### Phase 15 — Validation automatisée et visuelle

Exécuter après chaque lot :

- tests unitaires du moteur comptable ;
- tests statiques de sécurité et de build ;
- lint et vérification syntaxique ;
- tests de parcours sur données de démonstration ;
- audit axe-core ;
- mesure Lighthouse/Lighthouse CI et budgets d'actifs ;
- vérification visuelle dans le navigateur utilisé par Gaspard, en mobile puis ordinateur ;
- test réseau normal, lent, hors ligne et retour en ligne ;
- test iPhone/safe-area/clavier virtuel autant que l'environnement le permet ;
- preuve que les vraies données ne sont ni écrasées ni dupliquées.

### Phase 16 — Déploiement et durcissement final

1. Générer et vérifier `docs/`.
2. Committer les changements par lots compréhensibles.
3. Fusionner/pousser sur `main` uniquement après passage des gates locales.
4. Attendre la réussite de GitHub Pages.
5. Contrôler l'URL publique, ses assets et son service worker.
6. Révoquer la lecture anonyme Supabase après validation du nouveau bootstrap.
7. Refaire le parcours complet sur le site public avec le code correct et un code faux.
8. Vérifier une requête directe sans code et confirmer qu'aucun état n'est retourné.
9. Refaire les mesures de performance et recalculer la note.
10. En cas d'échec critique, restaurer le build et la politique précédente, puis corriger avant une nouvelle publication.

## 7. Budgets et gates non négociables

- Téléphone déjà validé, cache présent : interface utilisable en moins de 300 ms au p75.
- Téléphone déjà validé, en ligne : contenu à jour ou en revalidation en moins de 800 ms au p75.
- Premier chargement 4G : utilisable en moins de 1,5 s ; réseau lent : moins de 3 s.
- Feuille Dépense visible en moins de 100 ms.
- LCP inférieur à 2,0 s visé, 2,5 s maximum.
- INP inférieur à 200 ms.
- CLS inférieur à 0,05.
- Transfert critique initial inférieur à 300 Ko.
- Zéro requête tierce bloquante dans le chemin critique.
- Toutes les requêtes réseau ont timeout, retry maîtrisé et état utilisateur.
- Zéro lecture directe de l'état Supabase sans code.
- Zéro perte de données et zéro modification de Marseille.
- `npm run check` vert, tests nouveaux verts, audit accessibilité sans défaut critique.
- Score global mesuré supérieur ou égal à 90/100.

## 8. Fonctionnalités volontairement repoussées

Pour garder le produit rapide et utile pendant les trois mois, les fonctions suivantes ne sont pas dans le build principal : chat, calendrier complet, programme touristique, géolocalisation, notifications push complexes, reconnaissance automatique de ticket, comptes utilisateurs, IA conversationnelle, gamification, budget bancaire et nouvelle navigation à plus de trois onglets.

Elles ne seront ajoutées que si une preuve d'usage réelle le justifie après la stabilisation.

## 9. Ressources retenues

- Méthode Impeccable : contexte produit/design durable et contrôles déterministes.
- Vite : build statique modulaire, minification et découpage.
- Principes Workbox : stratégies de cache et cycle de mise à jour, sans imposer un gros runtime.
- Phosphor Pack : génération locale du seul sous-ensemble d'icônes utilisé.
- axe-core : contrôle accessibilité automatisé.
- Lighthouse CI : budgets et non-régression de performance.
- Documentation Supabase RLS/Realtime : sécurité de la lecture et stratégie de synchronisation.
- CSS/WAAPI/View Transition : mouvement natif et progressif.

Chaque dépendance devra justifier son poids. Une ressource de référence ne devient pas automatiquement une dépendance de production.

## 10. Boucle d'exécution autonome

Pour chaque phase :

1. inspecter l'état réel ;
2. écrire ou mettre à jour le test/critère ;
3. implémenter le plus petit lot cohérent ;
4. lancer les contrôles ;
5. examiner visuellement le résultat ;
6. corriger jusqu'au passage du gate ;
7. documenter la décision ;
8. seulement alors passer à la phase suivante.

Le mot `terminé` n'est utilisé qu'après vérification de la version publique. Une réussite locale ne suffit pas.

## 11. Livrables finaux

- Site public à l'adresse existante.
- Sources modulaires et build reproductible.
- Migration Supabase idempotente et procédure de retour arrière.
- Sauvegarde de l'état antérieur hors Git.
- Documentation `PRODUCT.md`, `DESIGN.md`, `PERFORMANCE.md`, `AGENTS.md`.
- Tests, audit accessibilité et contrôle de sécurité.
- Captures avant/après mobile et ordinateur.
- Rapport de performance avant/après avec mesures.
- Score final détaillé sur 100 et liste des éventuelles limites restantes.

## 12. Configuration d'exécution recommandée

- Modèle : `gpt-6-astra`.
- Effort : `ultra`.
- Déclencheur utilisateur unique : `GO`.

Après ce déclencheur, l'agent exécute toutes les phases, corrige les problèmes découverts dans le périmètre, publie, contrôle la production et rend le rapport final sans demander d'étapes manuelles, sauf blocage externe impossible à contourner proprement.
