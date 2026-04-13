# 066 Pitch Deck Surface Spec

## Document Control

- Status: Proposed
- Owner: Pitch deck surface
- Last updated: 2026-03-23

## Summary

Add a public pitch-deck surface inside `apps/noter` instead of creating a
separate app. The initial implementation is intentionally small: one app-owned
deck surface that proves route wiring, responsive layout, and PDF export
readiness. Deck copy and final storytelling come later.

## Goals

1. Add a public interactive route at `/pitch`.
2. Add a public print/export route at `/pitch/print`.
3. Add a public mobile print/export route at `/pitch/print/mobile`.
4. Use plain React components plus Tailwind utilities for the deck surface.
5. Keep the implementation generic under `pitchDeck` naming, not
   provider-specific naming.
6. Support PDF export as a separate command, not part of the default app build.
7. Keep one shared pitch-deck content source across desktop and mobile views.

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
- `scripts/export-pitch-deck.ts`

## Route Contract

### `/pitch`

- Public route that bypasses auth gating, following the existing special-route
  pattern used for `/privacy` and logo lab pages.
- Renders the shared pitch-deck content in responsive document flow.
- Acts as the single interactive source of truth for both desktop and mobile.
- Adapts to viewport size responsively instead of splitting interactive browsing
  into separate desktop and mobile routes.
- Does not depend on Convex queries, auth state, or app workspace data.
- Does not render app-only chrome such as the dashboard shell or `ChatFab`.

### `/pitch/print`

- Public route that renders the same deck in desktop print mode.
- Uses fixed desktop dimensions so PDF output is deterministic.
- Produces a stable horizontal layout suitable for PDF export.

### `/pitch/print/mobile`

- Public route that renders the same deck in mobile print mode.
- Uses the same slide content as `/pitch` and `/pitch/print`, but with a
  vertical layout preset for phone-sized sharing.
- Exists because PDF export needs deterministic page dimensions, while the
  interactive route should stay responsive.

## Content Contract

- Deck content must have one source of truth shared across all modes.
- Desktop and mobile must not fork copy into separate hand-maintained slide
  trees.
- Layout may branch by mode or breakpoint, but content order and messaging stay
  shared.

## UI Contract

The initial deck is a single slide whose purpose is to demonstrate the surface,
not the final content. It should visibly prove that the system can handle:

1. Large title and subtitle typography
2. A structured content grid
3. One visual/media block
4. One metrics or feature list block
5. A branded theme that feels intentional without heavy custom CSS
6. A desktop-horizontal presentation and a mobile-vertical presentation from the
   same content source

The deck should be implemented as normal app-owned React components. Tailwind is
the primary layout and typography system. Print-specific differences should be
handled through explicit layout presets, not a slide framework.

## Metadata Contract

- Add dedicated metadata for `/pitch`, `/pitch/print`, and `/pitch/print/mobile`
  in `apps/noter/src/lib/pageMetadata.ts`.
- Until the deck content is finalized, both routes should default to
  `noindex,nofollow`.

## PDF Export Contract

- PDF export is a separate command and not part of the default `pnpm build`
  path.
- Export flow:
  1. build the existing frontend
  2. serve the built app locally
  3. open `/pitch/print` in Playwright for desktop output
  4. write `pitch-deck.pdf`
  5. optionally open `/pitch/print/mobile` in Playwright for vertical output
  6. write `pitch-deck-mobile.pdf`
- The export command lives at repo level in `scripts/export-pitch-deck.ts`.

## Acceptance Checklist

- [ ] `/pitch` renders as a public route without sign-in
- [ ] `/pitch/print` renders as a public route without sign-in
- [ ] `/pitch/print/mobile` renders as a public route without sign-in
- [ ] The first implementation uses plain React components and Tailwind, not
      Spectacle
- [ ] The initial route contains exactly one polished demo slide
- [ ] The interactive route stays responsive instead of splitting into separate
      desktop and mobile interactive routes
- [ ] Desktop and mobile print outputs share one content source
- [ ] PDF export works through a separate command and does not run during the
      default app build
- [ ] At least one screenshot or visual test covers the shipped pitch-deck UI
