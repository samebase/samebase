# 128 Samebase server-side rendering with cookie sessions

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-20
- Base: `origin/main` at `5c2037dcf` (v2135)
- Decision taken on 2026-10-20: Route A, Convex Auth 2 beta with cookie sessions ("beta is good
  enough for us"). Route B, cookie sessions on Convex Auth 0.0.x through a v1 adapter entry, is the
  fallback and is not planned.
- Evidence: the apps already on convex-hosting with SSR (Bristol on adapter 0.9.4 with Convex Auth
  2.0.0-alpha.2, ChessMerge and Scout signed-out on 0.0.9x, the `tanstack-ssr` example and the
  `samebase/base-hosting` starter on adapter 0.10.x with 2.0.0-beta.0), the Convex Auth v2 docs at
  https://auth-v2.previews.convex.dev, and an inventory of `apps/samebase` at `origin/main`
- Related: `rfcs/127_SAMEBASE_ON_CONVEX_HOSTING_ROLLOUT.md` (done), `specs/102_...` (archived by
  this work), `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`, `rfcs/111` and `specs/111`
  (agent browser handoff), `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`

## Summary

1. Every page of samebase.com is rendered per request by `dist/server/server.js` inside the Convex
   deployment, through the convex-hosting TanStack adapter. The prerender, the SPA shell, the
   `_redirects` generator, and the hacks that exist because a static page cannot see the query
   string or the user all go.
2. Sessions move from localStorage tokens to HttpOnly cookies on Convex Auth 2.0.0-beta.0: the first
   HTML already knows the user. The 34 production users sign in once more; the 17 GitHub and the 1
   Google account attach to their existing `users` rows through the `createUser` hook; the 1
   password account gets a new password from `authAdmin` and keeps its `users` row.
3. Three PRs in order: the Convex Auth 2 cutover on the current SPA, the adapter gap in
   convex-hosting (OAuth under the cookie entry), then SSR with cookie sessions and the deletions.

## Facts

- The server already renders Samebase anonymously in two places: `vp dev` and the Playwright
  `vp preview` (every non-file request goes through `dist/server/server.js`). Production is the only
  place that serves the prerendered pages and the SPA shell. So the app's SSR blockers are the
  per-request ones, not module-scope browser access: no file touches `window` or `localStorage` at
  module scope.
- Auth today: Convex Auth 0.0.94 with a 205-line patch (OAuth error redirect, linking a provider to
  the signed-in user, `githubLogin`), `ConvexAuthProvider` in `AppRootClient.tsx`, tokens in
  localStorage, a pre-hydration inline script that reads them, `customClaims` with profile labels, a
  credentials provider `agent-browser-handoff` for `/agents/connect`, `AUTO_APPROVE_NEW_USERS`
  gating through `ApprovalGate`, password sign-in seeded by `devAuth:seedPasswordAccount` for
  previews and tests.
- Production: 34 users, 19 auth accounts (17 GitHub, 1 Google, 1 password), 95 sessions.
- Convex Auth 2.0.0-beta.0 (the newest): GitHub, Google and Apple as components with their own
  routes (`httpPrefix`), email+password with verification and reset by emailed link through
  `@convex-dev/resend`, username+password, passkeys, anonymous; `createUser` and `onSignIn` hooks;
  `getAuthUserId` stays; `authTables` and `auth.addHttpRoutes` are gone; env `AUTH_PRIVATE_KEY`,
  `AUTH_JWKS`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_GOOGLE_CLIENT_ID`,
  `AUTH_GOOGLE_CLIENT_SECRET`. Its docs say "Do not use Convex Auth v2 in production projects yet",
  stable targeted for Q4 2026, and the v1 migration page is an empty stub. No credentials method and
  no magic link or OTP are documented.
- Adapter 0.10.2 (`@samebase/convex-hosting-tanstack-start`): `convexSsr()` for Vite, a plain
  `./server` entry, and the `./convex-auth` entry (`SessionProvider`, `sessionBeforeLoad`,
  `SignedIn`, `SignedOut`, `redirectWithoutSession`, `useSignOutSession`) that pins
  `@convex-dev/auth` to 2.0.0-beta.0. The `/auth/signin`, `/auth/refresh` and `/auth/signout` routes
  live in the app's `src/server.ts` (`setupConvexAuthServer`, `httpCookies`, `ServerAuthSession`).
  Cookies: `__convexAuthJWT`, `__convexAuthRefreshToken`, HttpOnly, lax. OAuth code exchange is
  switched off in the entry (`ambientSignIns={[]}`) because Convex Auth's `oauth()` cleanup calls
  `history.replaceState` and drops TanStack Router state.
- Per-request data: each render makes its own `ConvexQueryClient` with `expectAuth: true`; loaders
  call `queryClient.query(convexQuery(...))` over HTTPS to the same deployment (two round trips,
  about 27 ms of a 36 ms render); direct `runQuery` is parked (convex-hosting PR 80). Pages are
  `no-store`. First byte about 0.5 s from Europe (one region) against 0.08 s for today's cached
  static landing.
- v2 mounts the GitHub callback at `<CONVEX_SITE_URL>/oauth/github/callback` by default. Samebase's
  GitHub App installation route already owns `/oauth/github/callback` (`convex/http.ts`), so the
  component takes another prefix.

## Target

- `src/server.ts` is the cookie-session wrapper from the hosting example: the three `/auth/*`
  routes, then `httpCookies`, `ServerAuthSession`, `handler.fetch(request, { context: { token } })`,
  `cookies.applyTo(headers)`. `convex/http.ts` imports `../dist/server/server.js` and calls
  `routeAll(http, components.hosting, versionId, server)`, then the three exact `/auth/*` POST
  routes on the handler it returns. The Convex Auth components own `/auth`, `/auth/github`,
  `/auth/google`.
- `getRouter()` builds a `ConvexQueryClient` per request with `expectAuth: true`; the root route
  runs `sessionBeforeLoad`; `SessionProvider` replaces `ConvexAuthProvider`; private routes gate
  with `redirectWithoutSession` in `beforeLoad` instead of `<Authenticated>` after hydration.
- Public pages render per request; nothing is prerendered at first. Docs `.md`, `llms.txt`,
  `robots.txt`, `sitemap.xml`, the manifest and `/assets/*` stay static files. Prerender of the docs
  and legal pages through the `x-prerender` header is a later optimization if the first byte
  matters.
- Headers for HTML come from the server response (a `start.ts` middleware: `frame-ancestors`,
  `X-Frame-Options`, `nosniff`, `no-store` and `noindex` on `/agents/connect`, `/oauth/mcp/consent`,
  `/oauth/provider-complete`); `public/_headers` keeps only the asset rules.

## Changes

### PR 1. Convex Auth 2 cutover on the current SPA

Isolates the user-visible change (one re-sign-in) from the rendering change.

- `apps/samebase/package.json`: `@convex-dev/auth` 2.0.0-beta.0; delete
  `patches/@convex-dev__auth@0.0.94.patch` and its `pnpm-workspace.yaml` entry. Add
  `patches/@convex-dev__auth@2.0.0-beta.0.patch`, which adds `deleteUser` to the core and password
  components for account deletion, until upstream ships deletion by user id.
- `convex/convex.config.ts`: `app.use(auth, { httpPrefix: "/auth", env })`,
  `app.use(github, { httpPrefix: "/auth/github", env })`,
  `app.use(google, { httpPrefix: "/auth/google", env })`, the password component. Keep
  `app.use(hosting)`.
- `convex/auth.ts`: `setupConvexAuth`,
  `setupGithub(...).attachUserCallbacks({ createUser, onSignIn })`, `setupGoogle(...)`, and the
  password method of Decision 1. `createUser` returns the existing `users` row when `authAccounts`
  holds the same provider account id, or the same verified email, and creates a row with `approved`
  per `AUTO_APPROVE_NEW_USERS` otherwise. `onSignIn` rejects users that cannot sign in and records
  the identity in `authAccounts`, which stays as Samebase's own sign-in identity table: GitHub App
  checks, invitations, Settings, and account deletion read a user's GitHub identity there, and the
  core has no lookup by user. The other v1 `auth*` tables leave the schema after the cutover; their
  documents stay until deleted from the dashboard.
- `convex/http.ts`: delete `auth.addHttpRoutes(http)`; the components serve their routes.
- `/agents/connect`: the `agent-browser-handoff` credentials provider has no v2 counterpart. The
  handoff mints a session for an existing user from a server-issued token: a public mutation
  `signInWithAgentBrowserHandoff` validates and consumes the token, then calls the core's public
  `signUp` or `signIn` with the core account `agentBrowserHandoff` of that user.
- Client: `ConvexAuthProvider` from v2 with `api.auth`; sign-in buttons through
  `useSignInWithGithub`, `useSignInWithGoogle`, the password mutations and `setSession`;
  `SignInForm`, `authClient.ts`, `useCloseOAuthPopup.ts` (the popup token relay) are rewritten or
  deleted: v2 OAuth is a redirect flow on the same origin, so the popup and the postMessage relay
  go.
- Env on production, dev and previews: `AUTH_PRIVATE_KEY`, `AUTH_JWKS`, `AUTH_GITHUB_CLIENT_ID`,
  `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`; delete
  `JWT_PRIVATE_KEY`, `JWKS`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`. `PASSWORD_AUTH_ENABLED` keeps the manual password switch.
  `devAuth:seedPasswordAccount` creates the seed account through the password component.
- Dashboards: the GitHub OAuth App callback becomes `https://samebase.com/auth/github/callback`, the
  Google redirect URI `https://samebase.com/auth/google/callback`.
- Tests: `SignInForm`, `authClient`, `useCloseOAuthPopup`, `githubAppSetupFlow` and the Playwright
  `storageState` seeding change with the client; the `convex-test` suites for auth move to the v2
  component API.
- Cutover: deploy, everyone signs in again, delete the v1 tables' documents after a week.

### PR 2. convex-hosting: OAuth under the cookie entry

Samebase is the first consumer of the `convex-auth` entry with OAuth, so the gap is closed in the
package first:

- A TanStack-safe ambient sign-in for the OAuth code exchange: finish the exchange without the
  `history.replaceState` cleanup, or clean the URL through the router. Record the flow error codes
  (`ACCESS_DENIED`, `EXPIRED`, `INVALID_FLOW`, `REJECTED`) as the replacement for the 0.0.94 patch's
  OAuth error redirect.
- README: the component prefixes for GitHub and Google callbacks, and the order in `http.ts`.
- Optional: a documented way for an app to add fields to `Register.server.requestContext` (today
  only the token), needed if the handoff token (below) travels through the server.

### PR 3. SSR with cookie sessions, and the deletions

- `apps/samebase/package.json`: `@samebase/convex-hosting-tanstack-start`; the `deploy` script drops
  `--html-handling none --not-found-handling single-page-application` and uses
  `--html-handling drop-trailing-slash --not-found-handling none`.
- `vite.config.ts`: `convexSsr()` before `tanstackStart()`; delete the `prerender` and `spa`
  options, the SPA shell constants, the `SAMEBASE_PRERENDER_ORIGIN` forwarding, the
  `writePublicPrerenderWithoutModulePreloads` hook. Keep the `samebase-source` condition,
  `codeSplitting: false`, the logo sync plugins and the docs-markdown plugin.
- New `src/server.ts` (the wrapper), `src/start.ts` middleware for the HTML headers.
- `src/router.tsx`: `expectAuth: true`; root `beforeLoad` runs `sessionBeforeLoad`; the `?prod-ui`
  stripping and the availability `notFound` use the request host and
  `VITE_SAMEBASE_ROUTE_ENVIRONMENT` on the server, not `window`.
- `AppRootClient.tsx`: `SessionProvider` in place of `ConvexAuthProvider`;
  `appAuthPresentationPrehydration.ts`, `appAuthPresentationRuntime.ts`,
  `appAuthPresentationState.ts`, `AppAuthPresentationProvider.tsx` and the inline script in
  `rootHead.ts` go: the server renders the signed-in state.
- Private routes: `redirectWithoutSession` in `beforeLoad` (`_authed` layout) replaces
  `AuthenticatedAppRoutePage`'s placeholder and sign-in branches and the client-side dashboard
  redirect in `useAppAuthRuntimeEffects.ts`; `RouteAccessOutlet` keeps the viewer-access and terms
  checks on data that loaders fetch.
- Loaders: the first page's data moves into route loaders (`queryClient.query(convexQuery(...))`)
  with query options in `*.queries.ts` files next to the routes; components use `useSuspenseQuery`.
  Start with the root viewer, the repository list and the repository page.
- Query-string and host hacks that exist because static HTML cannot see them:
  `useAppWorkspaceSpaShellFirstRender` in `AppWorkspaceShell.tsx`, `useHasHydrated` in
  `AppSidebarMetaSection.tsx`, `publicLandingLogoPrehydration.ts` and its consumers in
  `PublicLandingLogo.tsx` and `LandingHeroMenger.tsx`, the `hasHydrated` branches in
  `PublicLandingAuthControls.tsx`. The theme script keeps only the `?light`/`?dark` part; the
  `<html>` class is set by the server from the search.
- Render-time browser reads that would mismatch: `visualFixture.tsx` (`window.location`),
  `RouterGestureDebugOverlay.tsx`, `use-mobile.tsx`, `useDocumentThemeMode.ts`,
  `AccountDeletionBrowserBoundary.tsx`, `NotFoundRoutePage.tsx` (`Math.random` in state),
  `PublicLandingLogo.tsx` (module cache read). Each moves into an effect or a `ClientOnly`.
- Client-only libraries: the logo lab routes import three statically; they get `ssr: false`. Monaco,
  CodeMirror and the voxel preview already sit behind lazy routes.
- Delete: `prerender.config.ts` and its test, `scripts/generate-cloudflare-redirects.ts` and its
  test, `scripts/strip-public-prerender-modulepreloads.ts` and its test, the generated block of
  `public/_redirects` (the hand-written aliases become server redirects: `/favicon.ico`,
  `/landing*`, `/landing-preview*`, `/home*`), `e2e/spa-shell-hydration.spec.ts`,
  `e2e/workspace-prehydration-visual.spec.ts`, the `prerender` field of `routeAccessMetadata.ts`.
  The page-metadata check that lived in the strip script becomes a unit test on the rendered head.
- Keep the SEO assertions: a Playwright spec that fetches `/`, `/pricing`, `/docs` and the legal
  pages and checks title, description, robots and canonical in the server HTML.
- `convex/tsconfig.json`: drop `allowJs`. `convex/http.ts`: import `@samebase/convex-hosting` before
  the server build (`queueMicrotask`).
- Workflows: `deploy.yml` and `preview.yml` drop `SAMEBASE_PRERENDER_ORIGIN`; the preview still sets
  `SITE_URL` and seeds the password account. The bootstrap's one `deploy --dev` now also produces
  `dist/server/server.js`.
- Docs: README deploy section, `specs/102_SAMEBASE_PRODUCTION_WORKERS_TANSTACK_START_SPEC.md` to
  `archive/` with a supersession note, `docs/agent-workflows.md` route-first policy unchanged.

## Decisions

Each item is the recommendation. Say "no" to change it.

1. Password sign-in is a Samebase method on the v2 component API: `signInWithPassword` checks the
   password with the password component and mints the session through the core, and only server
   functions (`authAdmin`, the dev and preview seeds, local worktree sign-up) create password
   accounts. The v2 email+password method cannot serve Samebase: its `createUser` never sees the
   email, and a verified email exists only after the emailed challenge, so seed and operator-created
   accounts cannot exist.
2. Nothing is prerendered in PR 3. Prerender of the docs and legal pages comes back only if the
   measured first byte of those pages matters.
3. Existing users attach by provider account id first, verified email second. The one password user
   gets a new password from `authAdmin:createOrUpdatePasswordAccount`.
4. The GitHub and Google components mount under `/auth/github` and `/auth/google`; the GitHub App
   installation route keeps `/oauth/github/callback`.

## Validation

- PR 2: the hosting example signs in with GitHub under cookie sessions on a preview deployment.
- PR 1 on a preview: GitHub, Google and password sign-in; an existing GitHub user lands on their old
  `users` row; approval gating; the agent handoff; MCP consent.
- PR 3 on a preview: the first HTML of `/repo/...` for a signed-in cookie holds the page, not a
  placeholder; signed-out `/repo/...` answers a 307 to sign-in; `/` with `?dark` renders the dark
  class on the server; `/discord` answers 307 from the server; unknown paths answer 404; the SEO
  spec passes; `vp test` and the Playwright suites pass with cookie `storageState`.
- After the production cutover: time to first byte of `/`, `/pricing` and a repository page from
  Europe, against today's 0.08 s static landing.

## Non-Goals

- Direct SSR queries through `runQuery` (convex-hosting PR 80 stays parked).
- Moving the provider OAuth redirects (`PROVIDER_*_REDIRECT_URL`) off the `.convex.site` host.
- Removing api.samebase.com (RFC 127 section F stays as it is).
