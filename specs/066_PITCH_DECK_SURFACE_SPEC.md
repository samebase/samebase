# 066 Pitch Deck Surface Spec

## Document Control

- Status: Proposed
- Owner: Pitch deck surface
- Last updated: 2026-03-23

## Summary

Add a public pitch-deck surface inside `apps/noter` instead of creating a
separate app. The initial implementation is intentionally small: one Spectacle
page that proves route wiring, theming, and PDF export readiness. Deck copy and
final storytelling come later.

## Goals

1. Add a public interactive route at `/pitch`.
2. Add a public print/export route at `/pitch/print`.
3. Use Spectacle as the slide framework so the deck looks polished without
   building a custom slide system.
4. Keep the implementation generic under `pitchDeck` naming, not
   provider-specific naming.
5. Support PDF export as a separate command, not part of the default app build.

## Non-Goals

1. A multi-deck registry or deck-management system
2. Final pitch copy, deck narrative, or application-specific wording
3. PPTX export
4. Adding the pitch deck to the main product navigation

## Source Of Truth Files

- `apps/noter/src/App.tsx`
- `apps/noter/src/lib/pageMetadata.ts`
- `apps/noter/src/components/PitchDeckPage.tsx`
- `apps/noter/src/components/pitchDeck/*`
- `apps/noter/package.json`
- `scripts/export-pitch-deck.mjs`

## Route Contract

### `/pitch`

- Public route that bypasses auth gating, following the existing special-route
  pattern used for `/privacy` and logo lab pages.
- Renders a single Spectacle deck page in interactive mode.
- Does not depend on Convex queries, auth state, or app workspace data.
- Does not render app-only chrome such as the dashboard shell or `ChatFab`.

### `/pitch/print`

- Public route that renders the same deck in print mode.
- Disables interactive-only behavior such as animations, autoplay, keyboard
  hints, and presenter affordances.
- Produces a stable single-page layout suitable for PDF export.

## UI Contract

The initial deck is a single slide whose purpose is to demonstrate the surface,
not the final content. It should visibly prove that the system can handle:

1. Large title and subtitle typography
2. A structured content grid
3. One visual/media block
4. One metrics or feature list block
5. A branded theme that feels intentional without heavy custom CSS

Spectacle owns slide structure and theme primitives. Tailwind should be limited
to lightweight spacing, utility wrappers, and print-specific adjustments around
the Spectacle surface.

## Metadata Contract

- Add dedicated metadata for `/pitch` and `/pitch/print` in
  `apps/noter/src/lib/pageMetadata.ts`.
- Until the deck content is finalized, both routes should default to
  `noindex,nofollow`.

## PDF Export Contract

- PDF export is a separate command and not part of the default `pnpm build`
  path.
- Export flow:
  1. build the existing frontend
  2. serve the built app locally
  3. open `/pitch/print` in Playwright
  4. write `pitch-deck.pdf`
- The export command lives at repo level in `scripts/export-pitch-deck.mjs`.

## Acceptance Checklist

- [ ] `/pitch` renders as a public route without sign-in
- [ ] `/pitch/print` renders as a public route without sign-in
- [ ] The first implementation uses Spectacle, not a custom slide framework
- [ ] The initial route contains exactly one polished demo slide
- [ ] PDF export works through a separate command and does not run during the
      default app build
- [ ] At least one screenshot or visual test covers the shipped pitch-deck UI
