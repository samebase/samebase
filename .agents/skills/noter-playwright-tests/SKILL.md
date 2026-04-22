---
name: noter-playwright-tests
description:
  Authors and debugs Playwright coverage for the Noter app. Use when adding,
  updating, or fixing tests under `apps/noter/e2e`; choosing between
  `*-visual.spec.ts`, interaction `*.spec.ts`, and `.live.spec.ts`; adding
  screenshot coverage for shipped UI; or reproducing scroll, drag, focus,
  selection, auth, or route-shell regressions before writing a smaller test.
---

# Noter Playwright Tests

Add or repair Playwright coverage that matches the current Noter suite instead
of importing foreign test conventions.

## When To Use

- Writing a new Playwright spec in `apps/noter/e2e`
- Updating a spec after changing shipped UI or interaction behavior
- Deciding whether a regression should be covered by a visual, interaction, or
  live spec
- Turning a reproduced UI bug into a stable regression test
- Refreshing or tightening screenshot coverage for a shipped surface

## When Not To Use

- One-off manual browser inspection without changing tests
  - Use `skills/noter-playwright-live/SKILL.md` for that workflow
- Vitest or non-Playwright tests outside `apps/noter/e2e`
- Large speculative Page Object Model refactors that do not match the current
  suite

## Workflow

1. Inspect nearby specs in `apps/noter/e2e` before writing anything new.
2. Read `references/test-shapes.md` and choose the smallest correct test shape.
3. Read `references/authoring-patterns.md` before editing.
4. Match the current suite style:
   - prefer direct locators and file-local helpers over a new POM layer
   - prefer the real route first for scroll, drag, focus, selection, auth, and
     shell-layout bugs
   - only use a fixture when it mounts the shipped surface honestly
5. Add the smallest test that proves the behavior. Keep one scenario per test.
6. If you need examples, read `references/examples.md` and adapt a nearby Noter
   spec instead of copying imported examples blindly.
7. Run the narrowest relevant Playwright command from `apps/noter`.

## Commands

The repo already has two Playwright entrypoints in `apps/noter/package.json`:

- `npm run test:visual -- e2e/<file>.spec.ts`
  - despite the historical name, this runs the standard non-live Playwright
    config in `playwright.config.ts` for both visual and interaction specs
- `npm run test:live -- e2e/<file>.live.spec.ts`
  - runs `playwright.live.config.ts` for live authenticated flows

Use direct `npx playwright test ...` only when you need flags such as
`--update-snapshots` or want to point at one config explicitly.

For live route reproduction or local app startup, follow the repo's current
bootstrap rules and the existing `skills/noter-playwright-live/SKILL.md`
workflow.

## Critical Rules

- Use `*-visual.spec.ts` for screenshot-heavy checks of shipped UI states.
- Use plain `*.spec.ts` for interaction or regression coverage that does not
  need real external state.
- Use `.live.spec.ts` only when real auth, real integrations, or live app state
  are required.
- Do not introduce foreign conventions such as `*_views.ts`, `*_spec.ts`,
  `testDescription.md`, `onX` fixture catalogs, or `.cursor`-specific rules.
- Prefer small helper functions near the test. Extract shared helpers only when
  the interaction is genuinely reused or timing-sensitive.
- Trust Playwright actionability for `click`, `fill`, `hover`, and similar
  actions. Add explicit visibility assertions when they prove a state change or
  wait for UI after the action.
- When the change ships new or changed UI, add or update screenshot coverage.

## References

- `references/test-shapes.md`
- `references/authoring-patterns.md`
- `references/examples.md`
