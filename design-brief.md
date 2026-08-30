# Tricount Brazil — design brief

## Concept spine

Tricount Brazil is a quiet precision instrument for three months of shared
apartment life. It should feel as immediate as an iOS utility, as disciplined
as Linear, and warmer through a restrained Brazilian light signature.

## Product hierarchy

1. Accounts are the default and dominant experience.
2. Lists and tasks are one tap away, never buried in a generic dashboard.
3. Temporary guest groups remain contextual inside Accounts.
4. Details, history and rare settings progressively disclose instead of
   forcing long pages.

## Selected visual truth

- `refs/reference-accounts.png`: desktop composition, sidebar density,
  account hierarchy, compact activity rows and restrained color.
- `refs/reference-group.png`: contextual group detail, expense table,
  settlement review and right-side activity rhythm.
- `refs/marseille-before.png`: only for continuity and regression context;
  its visual language is intentionally replaced.

The false names, portraits, Portuguese labels and scenic photo in the probes
are not source data. Permanent people are exactly **Gaspard** and **Raphael**,
represented by initials in gradient circles.

## Visual system

- Canvas: near-black `#070908`; surfaces `#0d100f` and `#121614`.
- Text: warm white `#f5f7f3`; secondary `#919891`.
- Brazilian accents are localized, not decorative wallpaper:
  yellow `#f3c84b`, green `#43d17b`, blue `#4aa8ff`.
- System typography (`-apple-system`, BlinkMacSystemFont) is deliberate: the
  requested reference is iOS/macOS product UI, not a marketing page.
- Monetary values use tabular numerals.
- Small radii (10–16px), one-pixel separators, very few elevated cards.
- 44px minimum targets and visible keyboard focus.
- Motion is functional only, 150–250ms, disabled with reduced-motion.

## Asset strategy

The application itself uses no photos, mascot or decorative hero. Interface
icons come from Phosphor, not improvised SVG or emoji. Higgsfield is used for
the launch/OG asset and review gates, while the product UI stays deliberately
image-free. Gradient initial avatars are a user-requested UI primitive.

## Responsive delivery

- Mobile: Accounts first, fixed bottom tabs, thumb-reachable `+`, bottom
  sheets, amount focused first, compact history collapsed by default.
- Desktop: 248px sidebar, dense center column, contextual right rail when it
  improves comparison, global search in the top bar.
- No separate mobile product; the same data and actions adapt continuously.

## Interaction inventory

- Primary `+`: Dépense, À acheter, Tâche — and nothing else.
- Accounts: add/edit/duplicate/cancel expense, filter history, settle,
  search, export, create/open/close a temporary group.
- Lists: fast add, duplicate handling, quantities, categories, assignee,
  favorites/recent, recover checked items, turn a completed shop into an
  expense draft.
- Tasks: simple assignment and due dates; dedicated alternating routines for
  Gaspard and Raphael.
- Rare controls: settings, theme, notifications, sync and data export.

## Editorial exception to the Higgsfield website recipe

This is a signed-in-feeling utility, not a conversion landing page. It does
not need a cinematic hero, Tier-1 imagery or a marketing CTA stack. The
Higgsfield reference/asset/final gates still apply; its cover workflow supplies
the social launch image. Hosting stays on the existing GitHub Pages address,
as explicitly required, and the unrelated private Conta Brazil site is not
touched.
