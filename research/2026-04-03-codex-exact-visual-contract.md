# Codex Exact Visual Contract Research

## Goal

- Pivot `/machines` from "Codex-inspired" to an exact visual copy of the current
  Codex app shell, while keeping Noter's existing machine and thread contract.
- Treat the Codex app's public visual language as the baseline product decision,
  not just loose inspiration.
- Only add enhancements after the shell matches Codex closely:
  - reactive thread names that update immediately when machine thread metadata
    changes
  - phone-ready responsive behavior so the same surface works on mobile
  - Noter-specific auth, approval, and audit boundaries

## Official External References

These sources were reviewed on April 3, 2026.

- [OpenAI Codex product page](https://openai.com/codex/)
- [Introducing upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/)
- [Codex changelog](https://developers.openai.com/codex/changelog)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540/)

## Update After Screenshot Review

- Later feedback on April 3, 2026 clarified that trying to restyle the live
  route immediately is premature.
- The system-first build plan now lives in
  [2026-04-03-codex-pixel-perfect-system.md](/Users/nicu/.codex/worktrees/846d/noter/research/2026-04-03-codex-pixel-perfect-system.md).
- Treat this memo as the product-direction note and the newer memo as the
  implementation-system recommendation.

## What The Public Codex Surface Repeats

- A sparse, neutral shell with soft borders, large radii, restrained color, and
  almost no decorative product chrome.
- A left rail that reads as the product's primary control surface:
  - top-level actions such as new thread, automations, and skills
  - workspace grouping
  - compact thread rows with small relative timestamps
  - a light selected-row treatment instead of heavy cards or nested panels
- A main thread pane that favors plain text and compact work-log rows over heavy
  message framing.
- A bottom composer that is always present, oversized, and visually central to
  the layout.
- Review and diff affordances that feel integrated into the thread instead of
  feeling like a separate admin console.

## Hard Product Direction For Noter

- Keep the current route and API contract:
  - `machineId`
  - `threadId`
  - machine-local thread inventory
  - machine-local pinning
  - `/turn/start` continuation flow
- Change the visual contract aggressively enough that `/machines` reads as
  "Codex app in the browser" rather than "a Noter dashboard that knows about
  Codex."
- Preserve Codex's information hierarchy on desktop and mobile instead of
  inventing a separate phone-only IA.

## Required Deltas From Vanilla Codex

### 1. Reactive thread naming

- When the selected machine thread gains or changes a title, the sidebar row and
  header should update immediately.
- The UI should not require a manual refresh, route re-selection, or waiting for
  a slower background reload to reflect a renamed thread.
- This is the main enhancement beyond pure visual parity.

### 2. Phone support

- The same shell should work on phones.
- On small screens, the rail can collapse into a sheet, but the composer, thread
  timeline, and task identity should stay recognizably Codex-like.
- Mobile is not a stretch goal; public OpenAI materials explicitly say Codex
  works on phones and in the ChatGPT iOS app.

## Current Noter Mismatch

- [MachinesWorkspaceView.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/MachinesWorkspaceView.tsx)
  already has the right machine and thread structure, but the rail still reads
  like a Noter workspace shell with stronger accordion and status-pill chrome
  than the Codex app uses.
- [MachinesWorkspaceThreadPane.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/MachinesWorkspaceThreadPane.tsx)
  already has the right selected-thread timeline concept, but the presentation
  is still more dashboard-like than Codex.
- [CodexThreadBrowserView.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/CodexThreadBrowserView.tsx)
  is conceptually closer to the right mental model, but it still uses heavier
  card framing than the Codex app's current shell.

## Visual Contract To Copy

- Left rail:
  - flatter sections
  - less bordered chrome
  - softer selected state
  - tighter timestamp treatment
  - workspace and thread grouping that stays visually secondary to the thread
    list itself
- Main pane:
  - minimal top metadata
  - mostly plain-text assistant output
  - compact progress rows such as "thought", "explored files", and "changed
    files"
  - diff and review affordances that feel like part of the thread flow
- Composer:
  - large rounded input anchored at the bottom
  - exact Codex-style prominence
  - minimal surrounding controls
- Mobile:
  - same shell, not a different product
  - same composer prominence
  - same task/thread-first hierarchy

## Implementation Order

1. Restyle `/machines` to match the Codex shell before adding new features.
2. Make thread title updates visibly reactive in the rail and header.
3. Add a mobile pass that preserves the same contract on phone widths.
4. Refresh screenshot and route-level coverage around the real `/machines`
   surface.

## Guardrails

- Do not add extra Noter chrome, filler copy, or ornamental layout.
- Do not widen the route contract or invent alternate thread identity rules.
- Do not lose keyboard, focus, selection, approval, or audit behavior while
  restyling.
- Do not introduce speculative settings or fallback modes that the shipped
  surface does not need.

## Recommended First Slice

- Ship one route-level visual pivot on `/machines` that preserves the current
  data flow but changes the shell hard enough to match Codex's public UI.
- Validate that slice with the real route plus desktop and phone-width
  screenshots before expanding into deeper follow-up work.
