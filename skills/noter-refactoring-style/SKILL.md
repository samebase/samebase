---
name: noter-refactoring-style
description:
  Apply Noter's preferred refactoring style for simplifying shared UI and app
  architecture. Use when asked to refactor, simplify, standardize layouts,
  remove wrappers, migrate routes onto a shared shell, or delete compatibility
  layers instead of preserving them.
---

# Noter Refactoring Style

Use this skill when working in this repo and the job is to simplify, not to
preserve old structure.

## Goal

Refactor by making the standard more capable and the callsites dumber.

Routes, fixtures, and feature screens should mostly pass content into a shared
shape. They should not keep re-implementing shell behavior through adapters,
compat wrappers, or layout-owned prop plumbing.

## Core Principles

- Change the standard instead of adding another wrapper around it.
- Prefer deleting code over translating it.
- Treat backward compatibility with bad structure as a liability, not a goal.
- Keep one honest path alive end to end instead of preserving multiple partial
  paths.
- Prefer a two-pass refactor when removing structure: first move ownership
  without changing behavior, then delete the leftover wrapper or prop after a
  checkpoint and a quick UI check.
- After moving a seam, check immediately for leftovers such as old consumers,
  view models, fixture helpers, and types. Delete the ones that no longer have a
  real caller.
- Do not keep one-line exported wrapper components that only return another
  component. Export the real component directly unless the wrapper adds real
  behavior, ownership, or data shaping.
- If a JSX branch or ternary grows so large that it hides the parent component's
  real structure, extract it into a named component. Prefer the same file first
  unless the extracted piece is reused or deserves its own boundary.
- Start from an empty surface and add only the next thing the product truly
  needs. This applies to structure, props, and even small spacing utilities.
- Be suspicious of every new prop and every utility class. If you cannot name
  the current invariant it protects, do not add it.
- Distinguish shared shell from slot content. If a slot appears across routes or
  fixtures, keep its framing, sizing, and spacing in the shared owner and let
  callers provide only the inner content.
- When removing a style override prop from a shared component, do not shove the
  old special-case layout into the shared component unless every remaining
  caller truly needs it.
- When a prop is unused, always ask whether it should be deleted before adding
  any wrapper or compensating layout around it.
- Before adding a new shell or container, look for the existing owner of that
  invariant in production code and reuse that pattern instead of hand-writing a
  new one.
- Never fix a fixture with a one-off wrapper when the real app already has the
  shell that should own the behavior. Make the fixture match the real shell.
- Strip chrome down to what is necessary for the current working surface.
- Re-add secondary behavior only after the simplified core is solid.
- Make fixtures use the real standard instead of reconstructing the shell by
  hand.
- Use the type system as a live map of change impact.

## What "Simpler" Means Here

- Fewer components in the path from route to rendered shell.
- Fewer props whose only purpose is passing layout structure through unchanged.
- Fewer utility classes that exist only because a previous abstraction leaked
  the wrong ownership boundary.
- Fewer modes and branches that exist only for old seams or fixture-specific
  assembly.
- More direct APIs where screens provide `left`, `main`, `right`, `header`, or
  `content` instead of wrapping children in route-specific frame components.
- One shared primitive owning viewport, pane, and layout behavior.

## Preferred Refactor Moves

1. Find the real invariant.

- Ask what structure is truly shared across routes.
- Move that behavior into the shared component directly.
- Do not keep the old wrapper as a permanent translation layer if the new
  standard can own the job.

2. Make callsites describe content, not layout machinery.

- Prefer explicit content props over nested wrapper choreography.
- When a component is being used as configuration, names like `content` are
  often clearer than generic `children`.
- Route code should read like "fill these panes" rather than "assemble this
  shell."
- Keep shared components narrow. Let callsites own local spacing or alignment
  unless that layout is genuinely standard across all callers.

3. Collapse duplicate shells.

- If two layers both own frame, viewport, or pane behavior, merge them.
- Delete re-export files and thin aliases once the real import path is clear.
- Delete pass-through wrapper components once the real export path is clear.
- Remove helper components whose only value was preserving the old tree shape.

4. Fail closed during migration.

- If an old wrapper is no longer part of the intended path, remove it or make it
  obviously temporary.
- Do not quietly preserve broken or legacy behavior "just in case."

5. Remove non-essential features during the cleanup.

- Buttons, copy, docks, helper chrome, and decorative structure are optional.
- Layout integrity, scroll ownership, drag behavior, and containment are not.
- It is acceptable to comment out or defer secondary UI while establishing the
  correct shell, as long as the follow-up is explicit.

6. Probe the blast radius with types before committing to a direction.

- Keep `typecheck:watch` running during refactors when practical.
- Delete or rename a prop, type, wrapper, or export on purpose and use the
  resulting errors to see exactly which files still depend on it.
- It is valid to add a temporary suffix to an exported symbol just to surface
  every dependent callsite immediately.
- It is also valid to break something on purpose to verify that type safety is
  still catching the dependency edge you think exists.
- Treat type errors as a fast dependency graph for the current design, not just
  as correctness checks.
- If the fallout is small and coherent, keep going.
- If the fallout is broad, surprising, or crosses the wrong ownership boundary,
  reconsider the abstraction instead of patching the errors one by one.
- Strong type safety is valuable here because it makes refactor repercussions
  visible immediately.
- If an intentional break produces no useful errors where you expected them,
  treat that as an alarm bell: the type boundary may be weaker than it should
  be, or the abstraction may not be encoded honestly.

## Review Lens

When reviewing or authoring a refactor, prefer the version that:

- removes a component instead of renaming it
- replaces route-owned shell composition with shared-layout usage
- deletes compatibility props instead of threading them further down
- reduces fixture-specific assembly in favor of real production primitives
- shrinks the public API surface
- leaves fewer places where scroll, drag, or pane sizing can be owned

Treat these as red flags:

- a new adapter that mostly renames props
- preserving an old wrapper after all real callsites moved away
- keeping an exported component whose whole job is `return <OtherComponent />`
- adding style override props instead of changing the shared standard
- moving a deleted caller-specific layout hack into a shared component and
  pretending it is now universal
- multiple "temporary" modes that all survive the patch
- keeping dead exports or stub files around longer than necessary
- fixture-only structure leaking into production APIs without a real need

## Workflow

1. Read the real route and the current shared primitive.
2. Start or keep `typecheck:watch` running so the type graph stays live while
   you simplify.
3. Decide which layer should own the behavior after the refactor.
4. Move that ownership inward to the standard component.
5. Convert callsites to plain content/config props.
6. Delete obsolete wrappers, re-exports, and seam code.
7. Check for dead leftovers created by the move: old hooks, view-model types,
   fixture-only helpers, and shim files. If nothing real imports them anymore,
   delete them now.
8. Trim secondary chrome until the core shell is clean.
9. Validate on the honest route or a fixture that mounts the same production
   tree.
10. Do a garbage check before keeping the patch: unused prop? duplicate shell?
    fixture-only wrapper? If yes, delete it and try again.

## Small Two-Pass Examples

These examples matter because the hard part is often not noticing the final
garbage. The reliable move is to first re-home ownership safely, checkpoint,
then delete the now-obvious leftover. Another common reason to move ownership
inward is to stop fixtures from copying production styling. If the shared shell
changes later, the fixture should change with it instead of silently drifting.

### Example 1: Move shared shell ownership, then delete the leftover wrapper

Before:

```tsx
export function AppPageFrame({ children, topBar }: Props) {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <div>{topBar}</div>
      {children}
    </div>
  );
}

export function SomeRoute({ children }: { children: ReactNode }) {
  return (
    <AppPageFrame>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </AppPageFrame>
  );
}

export function SomeFixture({ content }: { content: ReactNode }) {
  return (
    <AppPageFrame>
      <main className="flex min-h-0 flex-1 flex-col">{content}</main>
    </AppPageFrame>
  );
}
```

Pass 1:

- Decide `AppPageFrame` should own the shared `main` shell.
- Move the `main` into `AppPageFrame`.
- Update both real callers to stop rendering their own `main`.
- This is not just deduplication. It makes the fixture inherit the real shell
  automatically instead of copying the same classes by hand.
- Checkpoint once behavior still matches.

```tsx
export function AppPageFrame({ children, topBar }: Props) {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <div>{topBar}</div>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

export function SomeRoute({ children }: { children: ReactNode }) {
  return <AppPageFrame>{children}</AppPageFrame>;
}

export function SomeFixture({ content }: { content: ReactNode }) {
  return <AppPageFrame>{content}</AppPageFrame>;
}
```

Pass 2:

- Look for any wrapper left behind by the ownership move.
- If the route still has:

```tsx
<div className="flex min-h-0 flex-1 flex-col">
  <main className="flex min-h-0 flex-1 flex-col">{children}</main>
</div>
```

- remove it and verify the real route still sizes and scrolls correctly.

The same rule applies to shared top bars and status bars:

- if `AppPageFrame` is the standard page shell, it should own the shared top-bar
  height, border, and container spacing
- a slot filler like `AppBuildStatusBar` should return only the content inside
  that shell
- otherwise every route or fixture that uses the slot can drift when the shared
  shell changes

### Example 2: Stop passing a prop first, then delete the prop

Before:

```tsx
export function WorkspaceLayoutV2FullPage({
  topBar,
  main,
}: {
  topBar?: ReactNode;
  main: Pane;
}) {
  return (
    <>
      {topBar}
      <WorkspaceLayoutV2 main={main} />
    </>
  );
}
```

Pass 1:

- Move the app bar outside this component.
- Change real callers so they no longer pass `topBar`.
- Checkpoint once the route still renders correctly.

```tsx
<AppPageFrame topBar={<AppBuildStatusBar />}>
  <WorkspaceLayoutV2FullPage main={main} />
</AppPageFrame>
```

Pass 2:

- Now that nothing real passes `topBar`, delete the prop from the component type
  and implementation.
- Do not add fake fixture chrome just to fill the old slot.

### Example 3: Replace a wrapper with the real export, then delete the wrapper

Before:

```tsx
export function VaultDashboard() {
  return <VaultDashboardContent />;
}
```

Pass 1:

- Update imports and callsites to use `VaultDashboardContent` directly.
- Keep behavior the same.
- Checkpoint once typecheck is clean.

Pass 2:

- Delete the wrapper export.
- Check whether any tests, stories, or fixtures were only keeping it alive out
  of habit.

## UI-Specific Biases

- Browser-owned page scroll is the default unless the route truly needs a
  contained viewport.
- Shared shells should own sizing, pane geometry, and containment.
- Route components should mostly own their real content, not structural chrome.
- Titles, triggers, and helper rows should exist only if the current surface
  truly needs them.

## Current Examples In This Repo

These patterns match the intended direction:

- Moving dashboard scene composition onto a shared workspace-layout-v2 page
  primitive instead of keeping a dedicated dashboard frame.
- Simplifying the workspace-layout-v2 visual fixture so it consumes the same
  standard page/pane API rather than manually rebuilding providers and wrappers.
- Exporting pane-frame props so pane definitions can be passed as data instead
  of assembled through custom wrapper components.

These patterns are acceptable only as short-lived migration steps:

- a stubbed legacy wrapper left behind only to unblock a broader move
- commented-out secondary UI that will return after the shell is corrected

If those temporary steps remain after the new path is stable, remove them.

## Communication Style

When explaining this style to the user:

- talk about ownership and invariants, not just file movement
- justify deletions in terms of simpler structure and fewer bad seams
- call out when a refactor intentionally drops backward compatibility with old
  layout code
- describe the end state as "one standard path" rather than "equivalent support
  for both systems"
