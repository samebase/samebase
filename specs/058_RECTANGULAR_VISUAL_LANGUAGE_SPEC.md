# Rectangular Visual Language Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/design system
- Last updated: 2026-03-19
- Related files: `apps/noter/components.json`, `apps/noter/tailwind.config.js`,
  `apps/noter/src/index.css`, `apps/noter/src/components/ui/*`,
  `apps/noter/src/lib/cornerNotch.ts`,
  `apps/noter/src/components/ui/button.tsx`,
  `apps/noter/src/components/input.tsx`, `apps/noter/src/components/card.tsx`,
  `apps/noter/src/components/CornerNotchVisualFixture.tsx`, `AGENTS.md`

## Conclusion

Noter adopts a hard-edged visual language for application chrome. All app-owned
surfaces, controls, overlays, and indicators render with zero border radius. The
default geometric unit is the rectangle, not the pill or circle.

This spec defines the policy, the shadcn/Tailwind enforcement points, and the
migration rules needed to make that choice durable across generated components
and product UI work.

## Goals

- Establish one consistent geometric language across the app.
- Make square corners the default and expected outcome for all UI chrome.
- Enforce the rule at shared theme/config layers instead of per-component fixes.
- Prevent future drift when adding new shadcn components or product surfaces.

## Non-Goals

- A full redesign of color, typography, spacing, or motion.
- A custom fork of shadcn/ui templates.
- Preserving legacy rounded treatments for stylistic reasons.
- Pixel-art styling beyond the geometry rule defined here.

## Design Principles

### 1. Hard edges are the default

Rounded corners are not part of the Noter visual identity. Surfaces should feel
precise, structured, and intentional.

### 2. Geometry communicates system-ness

The application shell, editors, dialogs, menus, and controls should read as
clean tools rather than soft consumer cards.

### 3. Emphasis comes from other primitives

Hierarchy should come from spacing, border weight, contrast, typography, and
motion rather than from rounded chrome.

### 4. Consistency beats local taste

Individual screens or components should not reintroduce radius because it feels
"nicer" in isolation. The system matters more than the isolated component.

## Policy

### 1. Global Radius Rule

- All app-owned UI chrome uses zero border radius.
- The shared theme token `--radius` resolves to `0`.
- The Tailwind border-radius scale resolves to `0` for all supported radius
  utilities, including `DEFAULT`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, and
  `full`.
- Tailwind also exposes `rounded-ui` as the semantic app-chrome utility, and it
  resolves through the shared `--radius` token.
- Directional radius utilities such as `rounded-t-lg` and `rounded-r-md` must
  also render square because they derive from the same zeroed scale.
- Arbitrary radius utilities such as `rounded-[6px]` are not allowed in
  app-owned UI code.

### 2. Scope

This rule applies to all app-owned chrome, including:

- Buttons, inputs, textareas, selects, tabs, toggles, badges, and checkboxes.
- Cards, panels, trays, drawers, dialogs, popovers, dropdowns, sheets, and
  toasts.
- Chat surfaces, repository/vault cards, banners, sidebars, terminals, and
  preview shells.
- Status indicators and affordances that previously used pills or circles.

This rule does not require reshaping content that is not app chrome, including:

- User-authored repository content rendered inside the editor or preview.
- External images, videos, or screenshots shown as content rather than as UI
  framing.
- Third-party embedded UI that cannot be restyled by Noter.

### 3. Exceptions

- There are no stylistic exceptions for app-owned chrome.
- If a third-party embed or browser-native control cannot be restyled, that
  exception is tolerated as an implementation constraint, not a design choice.
- Any deliberate exception in app-owned code requires an explicit product/design
  decision and should be documented in the introducing change.

### 4. Shadcn Configuration Contract

The official shadcn integration points remain:

- `components.json` for CLI generation settings.
- CSS variables in `src/index.css` for theme tokens.
- Tailwind config for utility resolution.

For Noter, the rectangular rule is enforced as follows:

- `components.json` continues to use CSS-variable theming.
- `src/index.css` is the source of truth for the shared radius token and must
  set `--radius: 0`.
- `tailwind.config.js` must zero the radius scale so generated shadcn utilities
  resolve to square corners by default.
- `tailwind.config.js` should expose `rounded-ui` so hand-written app chrome can
  express intent without relying on raw `rounded-none`.
- New shadcn components must be added through the CLI, but repo-level theme
  configuration must neutralize radius without requiring ad hoc edits to each
  generated file.

### 5. Generated Component Handling

- Do not manually edit generated shadcn files just to chase radius if the same
  outcome can be achieved through shared theme/config.
- If a generated template hardcodes a radius utility that is not covered by the
  shared zeroed scale, fix it in the smallest durable way after generation.
- `rounded-full` is not acceptable for app-owned UI. Any generated or
  hand-written usage must be replaced with a rectangular treatment.

### 6. Visual Language Implications

- Status dots become square indicators.
- Avatar-like affordances become square or unmasked unless the content itself
  ships with a fixed shape outside app control.
- Chat bubbles, badges, and chips become rectangular labels rather than pills.
- Floating panels and dialogs remain hard-edged on both desktop and mobile.

### 7. Corner Notch Variants

- Noter may use stepped corner-notch variants as an accent on otherwise
  rectangular chrome.
- `corner-notch-0` is the pure square baseline with no notch cutout.
- `corner-notch-1` adds one inner bridge step to the single-pixel outer cut and
  is the default notch variant.
- `corner-notch-2` uses a two-step diagonal cut (`2px` then `1px`) plus one
  inner bridge pixel per corner, scaled to the border stroke, so the border
  remains visually connected.
- Shared primitives such as `Button`, `Input`, and `Card` may expose
  `cornerNotch={0 | 1 | 2}` so product code can choose a notch type without
  hardcoding `corner-notch-*` utility strings.
- App-owned wrappers that own primary product chrome should default omitted
  `cornerNotch` to the repo notch default, while `cornerNotch={0}` remains the
  explicit square opt-out.
- Do not construct notch or Tailwind classes via template interpolation such as
  `corner-notch-${type}`. Map typed values to full literal class strings so the
  classes remain searchable and statically visible to tooling.
- The notch variants are geometry accents, not a return to rounded corners.
- Focus-visible and focus-within states must disable the clip-path so focus
  indication stays visible.

## Implementation Plan

### Phase 1. Theme Enforcement

- Set `--radius: 0` in `apps/noter/src/index.css`.
- Zero the Tailwind border-radius scale in `apps/noter/tailwind.config.js`,
  including `full`.
- Add `rounded-ui` in `apps/noter/tailwind.config.js` as the semantic utility
  for explicit app-owned chrome.

### Phase 2. Codebase Audit

- Remove arbitrary radius utilities such as `rounded-[...]`.
- Replace legacy `rounded-full` treatments in app-owned UI.
- Audit app surfaces that hardcode large radius classes such as `rounded-xl` or
  `rounded-lg` and confirm they now render square under the shared scale.

### Phase 3. Validation

- Perform visual QA on desktop and mobile-relevant layouts.
- Verify overlays, sheets, dialogs, and chat surfaces remain visually coherent
  with hard edges.
- Verify each supported corner-notch variant renders as intended and does not
  clip focus rings.
- Verify third-party and media content still display correctly when app framing
  is rectangular.

### Phase 4. Guardrails

- Document the rule in repo guidance so future UI work does not reintroduce
  rounded chrome.
- Add a lightweight automated check for app-owned usages of `rounded-full` and
  `rounded-[...]` if manual drift becomes a recurring issue.

## Acceptance Criteria

- App-owned UI chrome renders with square corners across the product.
- Shared theme configuration, not per-component overrides, is the primary
  enforcement layer.
- New shadcn-generated components inherit rectangular corners by default.
- App-owned `rounded-full` and arbitrary radius usages are removed or explicitly
  justified as documented exceptions.
- Desktop and mobile visual QA confirm the hard-edged language is consistent.

## Open Questions

- Should future brand work pair the rectangular geometry with a stricter type,
  grid, and icon spec, or should this remain a geometry-only rule for now?

## Summary

Noter should treat zero-radius rectangular chrome as a core visual-language
constraint. The durable implementation path is to enforce that rule through
shadcn configuration, CSS theme tokens, and Tailwind radius scale overrides,
then clean up the remaining hardcoded rounded usages in app code.
