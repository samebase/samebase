# Route URL Editor Preview Model

Date: 2026-06-04

## Status

Research note. This captures the current mental model and the ideas rejected during the Route URL
Editor spike. Promote a smaller accepted version into `specs/` only after the product behavior is
chosen.

## Why This Exists

We hit the same suggestion more than once: using router navigation with `replace` as a "preview"
mechanism.

That is not automatically wrong, but we do not yet have a model where it stays correct for temporary
route preview. It still mutates the real route, and the whole problem we just debugged is that
mutating the real route for weakly owned previews makes the app easy to desync.

## Actual Product Trigger

PWA mode has no browser URL bar.

The in-app URL editor is therefore not decoration. In PWA mode it is the app's visible/editable URL
surface.

The original value was:

- the user can see and edit the app URL inside the app.
- the URL editor makes route movement easy without needing browser chrome.
- the old mobile URL editor had picker/scroll behavior where the page underneath changed while the
  user explored routes.

The later sidebar hover work was a generalization of that mobile/editor preview idea. That
generalization is not the core product requirement.

## Terms

```ts
committedHref; // TanStack Router location; owns page render, browser URL, and history
draftHref; // text currently edited by the URL editor
previewHref; // temporary route intent while interacting
visibleHref; // previewHref ?? draftHref ?? committedHref, depending on the surface
```

Use the exact names. Do not call all of these `location`.

## Unproven Model: Preview By Mutating Router

Do not use `router.navigate(..., { replace: true })` as the default preview model.

Why it failed for ambient hover links:

- It still changes TanStack Router location.
- The browser URL changes even though the user has not committed navigation.
- The page renders the temporary route.
- Components that read `useLocation()` re-render around the temporary route.
- Sidebar links can disappear or relabel while the pointer is still interacting with them.
- Restoring depends on every hover/focus/unmount path firing correctly.
- Fast pointer movement and route remounts can leave the app in a half-restored state.
- The old URL editor, new URL editor, browser URL, and main page can show different routes.

The history problem is only one symptom. Even if `replace` avoids adding Back-button entries, it
still mutates the route and creates synchronization problems when the preview owner can disappear or
miss its cleanup event.

This does not prove `replace` can never be used by the URL editor. The URL editor has a stronger
interaction boundary: focus starts a session, the editor owns the draft, and Enter/Escape/blur can
be modeled explicitly. Sidebar hover does not have that same boundary.

## Public Precedents

The public pattern is consistent:

- Routers use hover as intent for preload/prefetch, not navigation. TanStack Router intent
  preloading uses hover/touch-start to preload route dependencies before the user navigates:
  https://tanstack.com/router/latest/docs/guide/preloading
- Next.js also frames hover as prefetching, and warns that custom Link behavior means maintaining
  prefetching, cache invalidation, and accessibility concerns:
  https://nextjs.org/docs/app/guides/prefetching
- React Router treats `setSearchParams` as navigation. That means updating URL search params is not
  a neutral local state update: https://reactrouter.com/api/hooks/useSearchParams
- Algolia InstantSearch syncs search UI state to the browser URL with `writeDelay`, explicitly to
  avoid one history entry per typed character:
  https://www.algolia.com/doc/api-reference/widgets/history-router/react
- nuqs defaults query state updates to `replace`, but still distinguishes immediate hook state from
  throttled/debounced URL updates: https://nuqs.dev/docs/options
- Browser address bars already separate typed draft, suggestions, and committed navigation. Chrome's
  omnibox extension API receives keystrokes for suggestions and only acts when the suggestion/input
  is accepted: https://developer.chrome.com/docs/extensions/reference/api/omnibox

The useful borrowed model is:

```ts
draftHref; // editable text or immediate local state
previewHref; // optional suggestion/page intent
committedHref; // router/browser/history state
```

Use `replace` only when the state is intentionally URL-owned but should be merged into the current
history entry. Do not treat it as a harmless preview operation.

## Rejected Model: Push On Each Character

Typing in the URL editor must not push history entries.

A typed character is not navigation. It is a draft edit.

## Current Better Model

Keep TanStack Router as the committed route only.

```ts
committedHref = tanStackLocation.href;
previewHref = temporary route intent | null;
visibleHref = previewHref ?? committedHref;
```

Then route consumers split by responsibility:

- page content reads `committedHref`.
- browser URL is `committedHref`.
- URL-looking UI can read `visibleHref`.
- sidebar hover can write `previewHref`.
- click/Enter commits to TanStack Router once.
- leaving/canceling clears `previewHref`.

This avoids the app pretending a temporary preview is the real route.

## URL Editor Specific Model

The URL editor needs its own draft state:

```ts
committedHref; // actual route
draftHref; // input text while editing
previewHref; // optional temporary route preview derived from suggestions/picker
```

Initial conservative behavior:

- focus creates/opens the editable draft.
- typing updates `draftHref`, not router.
- suggestion click updates `draftHref`.
- Enter or an explicit commit action pushes one router navigation.
- Escape restores `draftHref` to `committedHref` and clears preview.
- blur behavior is a product decision, not a router side effect.

Do not suggest "selectedSuggestion -> preview with replace" as the default. If selecting a
suggestion should preview the page, model it as `previewHref` first.

## Page Preview Is A Separate Product Decision

Showing `/home` or `/terms` in the URL editor on hover is not the same as rendering `/home` or
`/terms` in the main pane.

Main pane preview cannot be implemented by mutating TanStack Router on hover without reintroducing
the rejected model.

If we want main pane preview later, it needs a separate route-content preview renderer or another
explicit abstraction. That is a bigger product/architecture choice.

## What To Build Next

Stay focused on the URL editor first:

- make the new combobox a reliable replacement for the old editor.
- make input editing and suggestions clear.
- commit with Enter/click as one real navigation.
- decide whether mobile picker/scrub should set `previewHref`.
- only after that, decide whether sidebar hover previews are worth keeping.

The sidebar hover generalization should not drive the core URL editor design.
