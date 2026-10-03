# Tricount Brazil — système visuel

## Intention

Interface sombre, précise et calme, à mi-chemin entre iOS et Linear. Le Brésil apparaît par des accents jaune, vert et bleu, pas par des motifs touristiques. La priorité est la lecture et le geste rapide sur téléphone.

## Fondations

- Fond `#070A09`, surfaces `#0E1311` et `#151B18`.
- Texte clair `#F4F7F3`, secondaire `#A7B0AA`.
- Jaune `#F4D35E` pour l'action, vert `#52B788` pour la confirmation, bleu `#4D7CFE` pour l'information.
- Police système ; montants en chiffres tabulaires.
- Cercles dégradés à initiales pour Gaspard, Raphael et les invités.
- Cibles tactiles d'au moins 44 px et contrastes WCAG AA.

## Composition

- Trois onglets fixes sur mobile avec action centrale contextuelle.
- Le solde et le virement conseillé précèdent l'historique.
- Dépenses compactes, détails à la demande.
- Formulaires dans une feuille basse sur téléphone : montant, devise, titre, date et catégorie avant le pli ; action fixée en bas.
- Les choix secondaires passent par des sections repliables, jamais par un formulaire interminable.

## Mouvement

- Interactions : 120–180 ms ; feuilles et changements de vue : 180–240 ms.
- Courbe : `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animer transform et opacity seulement dans les gestes courants.
- Respecter `prefers-reduced-motion`.
