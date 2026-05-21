# Fast Public Landing Boot Specification

## Document Control

- Status: Superseded
- Owner: Noter frontend
- Last updated: 2026-04-26
- Related files: `apps/noter/index.html`, `apps/noter/src/bootstrap.ts`, `apps/noter/src/main.tsx`,
  `apps/noter/src/App.tsx`, `apps/noter/src/SignInForm.tsx`, `apps/noter/src/authClient.ts`,
  `apps/noter/src/components/FastPublicLandingShell.tsx`,
  `apps/noter/src/components/LandingCopy.tsx`, `apps/noter/src/lib/landingCopy.ts`,
  `apps/noter/src/components/ProsemarkReadOnly.tsx`, `apps/noter/src/lib/publicLandingAuthState.ts`,
  `apps/noter/e2e/public-landing-shell.spec.ts`

This spec records the former shell-first `bootstrap.ts` implementation. It is not the current
landing architecture. Current public-route work should use
`specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md` and the TanStack route tree as
the source of truth.

## Summary

The public landing route should feel fast before the full Noter app is ready. The implemented design
keeps the existing SPA and auth flow, but changes the boot sequence for plain `/`:

1. Render a minimal Tailwind landing shell immediately.
2. Start loading the real app in the background after a short delay.
3. Hand off to the full app once it finishes booting.

This is an explicit shell-first boot, not a route split to a separate Cloudflare page and not a
migration to server rendering.

## Goals

- Make plain `/` visibly useful before the full React + Convex app finishes loading.
- Preserve the existing full-app behavior after boot without creating a second product surface.
- Keep `/?dev` available for editable landing-copy work.
- Preserve Google auth behavior, including popup and top-level flows.
- Reduce the amount of authenticated-only UI that lands in the initial public app chunk.
- Add an automated browser-level speed check for the landing flow.

## Non-Goals

- A Cloudflare-only static landing page in this iteration.
- Moving the main app to `/app`.
- Introducing Next.js or SSR.
- Replacing the existing Convex-backed app auth flow.
- Solving every remaining large chunk in authenticated routes.
- Adding a bundle-size CI budget in this same slice.

## Implemented Design

### Entry-point split

- `index.html` now loads `src/bootstrap.ts` instead of mounting the full app directly.
- Global app CSS still loads up front so the shell and the full app share the same visual baseline.

### Fast-shell eligibility

The fast landing shell is used only when all of these are true:

- pathname is `/`
- query param `dev` is absent
- query param `auth` is absent
- local auth flag `noter_was_authenticated` is not set
- no restored Convex auth token is present in local storage

If any of those checks fail, the full app mounts immediately.

If local storage is unavailable in the current browser context, bootstrap treats those
storage-backed auth checks as absent instead of throwing.

### Shell-first public landing

The fast shell renders:

- the landing slogan
- the landing bullet list
- the reserved Google CTA slot
- the `/?dev` affordance

The shell content comes from shared landing-copy data so the shell and the post-boot app stay
aligned.

### Background app boot

- `bootstrap.ts` delays the full-app boot by `150ms`.
- After that delay it prefers `requestIdleCallback` when available and falls back to double
  `requestAnimationFrame`.
- The full app is loaded through dynamic import of `src/main.tsx`.

This makes the shell observable before the main app work begins while still keeping the handoff
fast.

### Full-app handoff

- `main.tsx` now exports `mountApp()` instead of auto-mounting on import.
- Once the background import resolves, `mountApp()` replaces the shell with the normal app tree.

The final product surface remains the same SPA after handoff.

### Auth behavior

- Plain `/` keeps the Google auth button mounted but hidden and non-interactive so the landing card
  reserves the same auth-row height as `/?dev`.
- Clicking the shell Google button in a top-level window sets `?auth=google` and forces the full app
  to boot immediately.
- Clicking the shell Google button inside an iframe reuses the existing popup auth flow through
  `openAuthPopup("google")`.
- `useAutoSignIn()` now honors top-level `?auth=google`, not just popup windows.
- After popup auth restores Convex auth tokens into storage, the next `/` load skips the public
  shell and mounts the full app immediately.

This keeps the shell-first route compatible with the existing auth entrypoint.

### Landing-copy rendering rules

- Normal `/` uses a plain Tailwind rendering path through `LandingCopy`.
- `/?prod-ui` keeps the normal landing-copy rendering path, but hides the dev-only password auth
  affordances and editable landing mode.
- `/?dev` still supports editable copy, but `ProsemarkReadOnly` is lazy-loaded only for that mode.

This avoids paying the ProseMirror/CodeMirror path cost for the normal public landing route.

### Authenticated-app chunking

The biggest authenticated-only surfaces now load lazily from `App.tsx`, including:

- `VaultDashboard`
- `FileView`
- `AddRepository`
- `ChatFab`
- `CodespaceChatOnlyView`
- `PricingPage`

This is required so the background app boot for unauthenticated users is much smaller than before.

## Validation

### Browser behavior

`apps/noter/e2e/public-landing-shell.spec.ts` covers:

- shell appears before the full unauthenticated app UI takes over
- reloading the production-shaped public shell keeps the landing card anchored instead of
  re-centering after the first visible paint
- public landing stays within the current Playwright navigation budget

Current budget:

- `responseEnd < 150ms`
- `domContentLoaded < 400ms`
- `load < 500ms`

These thresholds are intentionally browser-visible and local-preview-based.

### Build validation

The implementation must continue to pass:

- `pnpm --filter noter build:ci`

### Full repo hook path

The implementation was validated through the normal pre-commit path, including:

- repo lint
- script typecheck/lint
- shared Vitest suite

## Acceptance Criteria

- Plain `/` shows the landing shell before the full app UI renders.
- Plain `/` keeps the landing card and landing-copy block stable during reload instead of visibly
  shrinking after the first paint.
- Plain `/` remembers the last resolved password-auth mode so local worktree refreshes do not
  re-center the landing card while the public auth policy reconnects.
- Plain `/` keeps the Google auth slot hidden and non-interactive without changing the landing card
  height.
- `/?prod-ui` keeps the prod-like landing path and suppresses dev-only auth and editable
  landing-copy affordances.
- `/?dev` continues to use the editable landing-copy path.
- Shell Google CTA still reaches the existing Google auth flow.
- Restored popup-auth tokens prevent the public shell from flashing on the next `/` load.
- Full-app boot still happens automatically after the shell appears.
- Heavy authenticated surfaces are not bundled into the initial public app entry chunk.
- Playwright has an explicit timing-based assertion for the public landing.

## Deferred Follow-Ups

- Add a bundle-size CI budget for the landing bootstrap path.
- Decide whether plain `/` should eventually move to a Cloudflare-served static page instead of
  booting the SPA in the background.
- Further split very large authenticated chunks, especially `FileView`.
