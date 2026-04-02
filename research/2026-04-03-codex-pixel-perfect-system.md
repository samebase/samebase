# Codex Pixel-Perfect Clone System Research

## Why This Exists

- After screenshot review on April 3, 2026, iterating directly on `/machines` is
  not worth it yet.
- The current approach keeps producing "Noter with Codex styling" instead of a
  pixel-perfect Codex clone.
- This note answers a narrower question than the earlier visual-contract memo:
  what system should Noter build first so a pixel-perfect Codex representation
  is even feasible?

## Relationship To Earlier Research

- [2026-04-03-codex-exact-visual-contract.md](/Users/nicu/.codex/worktrees/846d/noter/research/2026-04-03-codex-exact-visual-contract.md)
  still captures the product direction correctly.
- This note supersedes that memo's earlier "restyle `/machines` first" instinct.
- New recommendation: build a dedicated clone system before touching the live
  route again.

## Current External References

Reviewed on April 3, 2026:

- [OpenAI Codex product page](https://openai.com/codex/)
- [Introducing upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/)
- [Codex changelog](https://developers.openai.com/codex/changelog)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540/)

These current references reinforce a few stable product facts:

- Codex is one product experience across app, web, and phone.
- The app exposes built-in worktrees, skills, automations, and git actions.
- The public shell repeats the same left rail, large composer, and minimal
  thread chrome across surfaces.

## Core Conclusion

- Do not keep mutating the shared Noter workspace shell toward parity one class
  at a time.
- Build a dedicated "Codex mirror system":
  - reference captures
  - measured visual tokens
  - dedicated visible primitives
  - a thin data adapter that preserves Noter's current machine and thread
    contract

If the goal is pixel-perfect representation, the visible shell needs its own
source of truth rather than a gradual restyle of shared Noter primitives.

## Why The Current Shell Fights Parity

- [RepositoryWorkspaceFrame.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx)
  hardcodes a shared header structure, trigger placement, and spacing that are
  not Codex's geometry.
- [WorkspaceSidebarShell.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx)
  encodes shared workspace pane math, carousel behavior, and sidebar structure
  for Noter's route shell, not for a Codex clone.
- [button.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/ui/button.tsx)
  bakes in Noter/shadcn sizing, radii, font weight, hover, and focus treatment.
- [index.css](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/index.css)
  defines global theme tokens for Noter, not a Codex mirror.
- [MachinesWorkspaceView.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/MachinesWorkspaceView.tsx)
  already reflects machine-first and project-first assumptions that are useful
  functionally but too opinionated visually.

These files are valuable for behavior and domain wiring, but they are poor
foundations for exact surface replication.

## Best Local Starting Point

- [CodexThreadBrowserVisualFixture.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/CodexThreadBrowserVisualFixture.tsx)
  is a better conceptual seed than the live machines shell because it already
  aims at Codex-like thread browsing.
- Even that fixture should be treated as reference material, not as the final
  primitive set.
- The next system should copy ideas from it into a new dedicated subtree rather
  than keep layering exceptions onto the existing fixture.

## Recommended System

### 1. Reference Pack

- Capture reviewer-owned desktop and phone references of the real Codex app.
- Freeze one canonical desktop frame and one canonical phone frame before
  implementation starts.
- Mask the macOS traffic-light buttons and any other intentionally ignored
  native chrome, since the goal is "pixel perfect except the colored buttons."
- Avoid shipping official OpenAI screenshots in the product bundle. If direct
  reference captures are kept locally for comparison, treat them as reviewer
  assets rather than shipped UI assets.

### 2. Measurement Manifest

- Create a single manifest for measured Codex metrics:
  - rail width
  - split position
  - top and side padding
  - row height
  - icon box size
  - font size, line height, and weight
  - border and divider colors
  - radius values
  - composer height and inset
- Store these values in one explicit TypeScript or JSON source rather than
  scattering them through Tailwind utility strings.
- The visual system should consume those tokens directly.

### 3. Dedicated Visible Primitives

- Create a new subtree such as
  [apps/noter/src/components/codex-shell](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components)
  with dedicated components for:
  - window chrome
  - sidebar action list
  - thread list
  - thread row
  - pane header
  - timeline rows
  - composer
  - split layout
- Use raw elements plus CSS variables for visible chrome.
- Use custom SVG icons wherever Lucide or Radix icons do not match Codex closely
  enough.
- Use shadcn/Radix only for behavior primitives that do not define the visible
  shape:
  - tooltip
  - popover
  - dialog
  - sheet

### 4. Adapter Layer

- Add a `CodexShellViewModel` adapter between Noter's machine data and the clone
  UI.
- Preserve the existing route and API identity:
  - `machineId`
  - `threadId`
  - machine-local thread inventory
  - machine-local pinning
  - `/turn/start`
- The clone UI should receive already-shaped visual rows and pane data rather
  than reading raw machine state directly.

### 5. Acceptance Harness

- Build a comparison fixture that renders:
  - the frozen reference capture
  - the local clone
  - a pixel diff or mismatch count
- Reuse the same-browser comparison idea already documented in
  [061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md](/Users/nicu/.codex/worktrees/846d/noter/specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md)
  rather than relying only on ordinary screenshot snapshots.
- Keep the comparison strict about:
  - viewport
  - background
  - device-pixel ratio
  - mask regions
  - crop boundaries
- Keep a normal Playwright screenshot alongside the exact comparison so humans
  can still review the result visually.

### 6. Route Integration Order

1. Build a static desktop Codex clone fixture.
2. Build a static phone Codex clone fixture.
3. Reach parity in the comparison harness, excluding masked buttons.
4. Mount the same components on the live `/machines` route.
5. Only then add reactive thread-name updates.
6. Only after that, expose unsupported Codex controls as disabled placeholders.

This sequence matters because the visual shell must be correct before feature
fallbacks and dynamic state get layered in.

## Reuse Guidance

### Safe To Reuse

- existing machine and thread fetching
- route params and URL helpers
- tooltip and popover behavior primitives
- Playwright fixture infrastructure
- honest production-component fixture patterns

### Avoid Reusing For Visible Chrome

- [RepositoryWorkspaceFrame.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx)
- [WorkspaceSidebarShell.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx)
- [button.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/ui/button.tsx)
- [MachinesWorkspaceView.tsx](/Users/nicu/.codex/worktrees/846d/noter/apps/noter/src/components/MachinesWorkspaceView.tsx)

## First Deliverable

- One dedicated desktop comparison fixture that can prove a single Codex frame
  matches a real reference capture except masked native buttons.
- If that is not exact yet, do not resume editing the live route.

## Practical Next Step

- Create a new research or fixture task whose only output is the comparison
  harness and token manifest, with no live-route changes in the same patch.
