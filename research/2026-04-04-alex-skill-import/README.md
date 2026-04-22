# Alex Skill Import

## Provenance

These files were added to the repo as a new top-level `alex_skills/` folder on
2026-04-04 and were moved here intact so they remain available as research input
instead of silently becoming active repo policy.

## Why This Lives In Research

The bundle mixes useful Playwright testing ideas with assumptions from another
stack:

- Planable-specific product areas and naming
- Cursor-specific `.mdc` and `.cursor/skills` wiring
- Meteor and TRPC testing conventions
- a Page Object Model structure that Noter does not currently use

Per this repo's `research/` rules, external material that informs decisions but
does not define accepted behavior belongs here until it is adapted.

## What We Reused

The new agent skill at `.agents/skills/noter-playwright-tests/` distilled the
portable parts that fit Noter:

- test-shape classification from `skill.md`
- scenario scoping, loop discipline, and negative assertions from `skill.md`
- Playwright actionability guidance from `pom_patterns.md`
- a few example categories from `examples.md`

## What Stayed Research-Only

These files were intentionally not promoted verbatim:

- `skill-1.md`
  - depends on `testDescription.md` files and `onX` fixture catalogs that Noter
    does not use
- `skill-2.md`
  - hard-codes `.cursor` paths and a repo-specific QA maintenance workflow
- `skill-3.md`
  - CI test-selection logic is specific to another monorepo and product map
- `skill-4.md`
  - unit-test guidance is oriented around Meteor, TRPC, `sinon`, and `nock`
- `e2e-standards.mdc`
  - useful as inspiration, but the file format and linked paths are Cursor-only

## Inventory

- `e2e-standards.mdc`
- `examples.md`
- `pom_patterns.md`
- `skill.md`
- `skill-1.md`
- `skill-2.md`
- `skill-3.md`
- `skill-4.md`
