# Tricount Brazil — Brief de refonte V2

## Design read

Un outil quotidien pour deux colocataires au Brésil : rassurant comme une app Apple, instantané comme une note partagée, assez distinctif pour donner envie de l’ouvrir plusieurs fois par jour.

## Outcome

Réduire le temps nécessaire pour comprendre le solde, ajouter une dépense, cocher un achat et terminer une tâche tournante, sur téléphone comme sur ordinateur.

## Contraintes verrouillées

- Conserver les fonctions et les données actuelles.
- Conserver les noms exacts Gaspard et Raphael.
- Conserver le mode sombre et l’inspiration iOS/Linear.
- Utiliser le jaune, le vert et le bleu du Brésil comme lumière et repère, jamais comme décor touristique.
- Utiliser des cercles dégradés avec initiales, sans photos.
- Garder trois destinations principales : Comptes, Listes, Tâches.
- Garder Réglages et Recherche comme outils secondaires.
- Une action primaire contextuelle par destination.
- Aucun recouvrement de la navigation fixe sur mobile.
- Taille de corps cible 15 à 16 px, contrastes renforcés, zones tactiles de 44 px minimum.

## Direction typographique

- Satoshi ou Geist pour l’interface, avec chiffres tabulaires.
- Une seule famille visible si possible.
- Hiérarchie plus courte : contexte, résultat, action, détails.
- Libellés techniques rares, jamais sous 11 px.

## Palette commune

- Fond : `#070A09`
- Surface : `#0E1311`
- Surface haute : `#151B18`
- Texte : `#F4F7F3`
- Texte secondaire : `#A7B0AA`
- Jaune : `#F4D35E`
- Vert : `#52B788`
- Bleu : `#4D7CFE`

Les trois couleurs sont explicitement demandées par l’utilisateur. Elles apparaissent surtout dans un spectre continu et dans les états sémantiques, sans glow néon.

## Option Night Ledger

- Spine : outil de précision.
- Structure : grille suisse, résumé compact en bandeau, dépenses comme journal continu.
- Signature : rail coloré discret qui relie solde, personnes et virement.
- Chrome : angles 14 px, séparateurs fins, boutons pleins seulement pour l’action primaire.

## Option Brazil Signal

- Spine : système vivant.
- Structure : grande surface centrale colorée selon l’équilibre, panneaux secondaires en feuilles superposées.
- Signature : halo organique généré, sensible au solde et repris dans les empty states.
- Chrome : surfaces souples 18 px, contrôles segmentés, mouvement de profondeur léger.

## Option Apartment Cockpit

- Spine : parcours par points de passage.
- Structure : rail d’état horizontal, vues Comptes/Listes/Tâches comme instruments spécialisés.
- Signature : carte abstraite de flux entre Gaspard et Raphael, sans avatar photo.
- Chrome : capsules courtes, cadres internes précis, navigation mobile en dock flottant compact.

## Asset plan pour l’idéation

- Une plaque de matière lumineuse Higgsfield par option.
- Le screenshot actuel Comptes desktop comme source fonctionnelle.
- Trois mockups 1440 × 1024 générés indépendamment.
- Après sélection : déclinaison mobile 390 × 844, empty states, icon set et OG card.
