# Root Route, Framework, and Runtime Decision Summary

## Status

- Date: April 8, 2026
- Scope: `apps/noter`
- Purpose: Capture the current discussion around Noter's root-route contract, React Router,
  Cloudflare Pages vs Workers, PWA concerns, and the path that best fits a future template.

## Why This Note Exists

The recent React Router framework migration attempt exposed a deeper question than "which router
should we use."

The actual question is:

- how should Noter handle `/` when `/` is both the public landing page and the signed-in dashboard
  entry point,
- while keeping one app, one deployment pipeline, Convex as the backend, and a template-friendly
  stack?

This note summarizes the discussion so the decision does not live only in chat.

## Product Constraints That Drove the Discussion

These constraints came up repeatedly and are the real boundaries of the problem:

- `/` must stay on `/`.
- `/` must feel instant for anonymous users.
- `/` is also the dashboard entry point for signed-in users.
- the app should remain one app and one deployment, not a separate marketing app plus product app
  split.
- Convex should remain the backend.
- Cloudflare is the default front door.
- the future template should stay simple and honest.

Those constraints are more important than whether the router is called React Router, Astro, TanStack
Start, or Next.js.

## What Happened With React Router Framework Mode

The original hope was reasonable:

- start from a simple React SPA,
- use React Router now,
- and keep an easy path to the React Router framework later if a project needs more features.

The production incident showed that this upgrade path is not a cheap toggle on Cloudflare Pages.

### Incident Summary

- React Router framework mode was bootstrapped on Cloudflare Pages.
- The static hosting fallback path exposed `__spa-fallback`.
- Production redirected users from `https://noter.md/` to `https://noter.md/__spa-fallback`.
- The redirect loop and fallback URL exposure broke the root-route contract.
- Follow-up fixes did not produce a clean result on Pages.
- The changes were reverted from `main`, and Cloudflare cache had to be purged to fully recover the
  custom domain.

The detailed incident note lives in
`research/2026-04-07-react-router-cloudflare-pages-routing-incident.md`.

### Core Technical Finding

The regression was not just a bad `_redirects` line.

It was a mismatch between:

- React Router's generic documentation for `ssr: false` plus pre-rendering and SPA fallback files,
  and
- Cloudflare's actual supported deployment path for React Router framework applications.

On Cloudflare, the supported React Router framework path is Workers with `ssr: true`, not static
Pages with `__spa-fallback` rewrites.

That means the original promise:

- "start as a simple React Router SPA now, then later switch to React Router framework mode"

is not false in principle, but it is misleading in practice if it sounds like a configuration-only
upgrade on Cloudflare.

It is not.

It is an architecture change.

## The Real Problem Is `/`, Not Routing in General

This discussion repeatedly came back to the same point:

- many apps split landing and dashboard into different routes,
- Noter deliberately does not want that split,
- so `/` carries conflicting responsibilities.

Most of the framework pain comes from that one decision.

### Why `/` Is Hard

Noter wants all of these at once:

- prebuilt fast first paint at `/`,
- same URL for anonymous and signed-in entry,
- no visible fallback URLs,
- no redirect tricks,
- one app,
- one deployment,
- no separate marketing pipeline.

There is no framework that makes those constraints disappear.

If `/` behaves differently for anonymous and signed-in users, then one of the following must be
true:

1. `/` is a static document first, and the client takes over after boot.
2. `/` is rendered at request time by a server runtime that can read auth.

That is the real decision boundary.

There is no simple fourth option that is:

- static for anonymous users,
- auth-aware for signed-in users,
- same URL,
- no bootstrap,
- and no server runtime.

The complexity has to live somewhere.

## What the Current Bootstrap Actually Does

The existing root bootstrap is in `apps/noter/src/bootstrap.ts`.

It is not just accidental glue. It currently owns the shipped product contract for `/`.

### Responsibilities of the Current Bootstrap

- render a minimal landing shell immediately,
- keep the browser on `/`,
- delay the full app boot slightly so the shell is visible,
- boot the real app in the background,
- trigger the auth entry path when needed,
- hand off state such as scroll position and waitlist draft state into the real app,
- apply some metadata and theme behavior before the main route tree mounts.

This is documented in `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`.

### Why It Exists

The bootstrap exists because it is the cheapest way to satisfy the current contract:

- fast root route,
- same URL,
- no separate deployment,
- no Worker runtime.

### Why It Still Feels Wrong

It is also a real architectural smell because it creates two frontend entry paths:

1. the normal app route tree, and
2. a handwritten shell path that later hands off to the app.

That smell is documented in
`specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`.

That spec is right to treat the bootstrap path as deletion-candidate code once the route tree and
runtime can own the same contract cleanly.

The key correction is:

- the bootstrap is temporary architecture,
- but it cannot be removed until something else fully replaces what it does.

## What We Learned About Template Strategy

The original intent behind choosing React Router was good:

- simple SPA first,
- richer framework path later,
- avoid painting users into a corner.

The revision to that story is:

- keep the codebase framework-ready,
- but stop implying that a future framework/runtime upgrade is free.

### More Honest Template Positioning

The template should be described as:

- `Vite + React + react-router-dom + Convex`
- hosted as a static app
- with a strong internal route structure
- and a possible later path to a server runtime if needed

That is a better promise than:

- "use this now and later just turn on framework mode"

because the second promise hides the real deployment/runtime tradeoff.

### What "Framework-Ready" Should Mean

Framework-ready should mean:

- clean route boundaries,
- clean layout boundaries,
- route-owned data loading concerns,
- reusable wrappers,
- limited coupling between shell components and routing APIs,
- minimal assumptions that block a future migration.

Framework-ready should not mean:

- guaranteed config-level migration to a framework runtime.

## What We Learned About Vite and Prebuilt Routes

A key part of the discussion was whether a plain Vite SPA can still prebuild important routes.

The answer is yes, for exact known routes.

### What Vite Can Do Cleanly

Vite can support:

- a real static root document,
- real static `/privacy`,
- real static `/terms`,
- other exact public HTML outputs generated at build time.

Noter already does this today:

- `apps/noter/public/privacy/index.html`
- `apps/noter/public/terms/index.html`
- `apps/noter/public/_redirects`
- `apps/noter/vite.config.ts` generates those legal pages from markdown during build.

So a plain Vite app can absolutely have:

- a fast static `/`,
- a few prebuilt public routes,
- and SPA routing for the rest.

### What Vite Alone Does Not Give You

Plain Vite is not a full route-prerendering framework for arbitrary client routes. If you want many
routes rendered with auth-aware request-time logic, you are back in server runtime territory.

That means the current Noter shape is still valid:

- static public documents where helpful,
- fast shell at `/`,
- SPA for the main app.

## What We Learned About Astro

Astro came up as a possible better static-first fit.

### Where Astro Looks Good

Astro is attractive when you want:

- content-first public pages,
- strong pre-rendering defaults,
- selective interactivity,
- and fine-grained hydration of islands.

### Where Astro Stops Being Simple for Noter

Noter is not just a content site with a small app island.

The problem remains that `/` is both:

- a public landing page,
- and the signed-in dashboard entry.

If `/` stays static in Astro, the client still has to take over for signed-in users.

If `/` becomes auth-aware on the server, Astro needs a Worker runtime.

So Astro is viable, but it does not make the root-route tradeoff disappear. It mostly changes where
the complexity lives.

For a reusable template centered on React + Convex, Astro also creates a more split mental model
than the current stack.

## What We Learned About Workers

This discussion also clarified the Cloudflare platform model.

### Pages vs Workers

- Pages/static hosting is the right fit for static documents and SPAs.
- Workers is the Cloudflare runtime equivalent of the server/runtime layer that Vercel provides for
  Next.js.

That distinction matters.

If the team wants:

- SSR,
- request-time auth-aware root rendering,
- framework middleware/server features,
- and a Vercel-like "full app runtime" story on Cloudflare,

then Workers is the right substrate.

### What Workers Would Solve

Workers can solve the clean same-URL root problem:

- request `/`
- read auth/session at request time
- return landing HTML for anonymous users
- return dashboard HTML for signed-in users
- keep the URL on `/`

This is the cleanest framework answer.

### What Workers Would Cost

Workers also add:

- runtime complexity,
- more caching/session nuance,
- more deployment complexity than a static `dist/` app,
- a heavier template story.

So the correct framing is not:

- "Workers is better"

but:

- "Workers is the right substrate if request-time rendering is actually needed now."

## What We Learned About PWA vs SPA

Another concern was whether moving away from a pure SPA would hurt PWA support.

The conclusion is:

- PWA and SPA are not the same thing.
- A PWA does not require an SPA.
- SSR apps can still be PWAs.

What makes a PWA is things like:

- a web app manifest,
- installability,
- service worker behavior,
- offline or resilient caching strategy.

So SSR on Workers is compatible with a PWA.

The real tradeoff is operational:

- a SPA often makes app-shell and offline behavior simpler,
- SSR can improve first load and personalization but needs a more deliberate caching/offline setup.

That means the PWA requirement does not force the stack to stay pure-SPA. It just means the team
should not casually assume SSR solves everything "for free."

## Where WorkspaceLayoutV2 Fits

`WorkspaceLayoutV2` came up because it represents the route and shell refactoring that was already
planned before the framework incident.

This is an important distinction:

- `WorkspaceLayoutV2` is an internal app-structure migration.
- Workers, SSR, Astro, TanStack Start, or React Router framework mode are runtime/deployment
  migrations.

Those two tracks should not be coupled unnecessarily.

### Why the Separation Matters

If the team mixes them together, the migration becomes:

- route-shell rewrite,
- framework migration,
- runtime migration,
- and root-route redesign

all at once.

That is too much coupled risk.

### Better Sequencing

The cleaner sequence is:

1. finish the `WorkspaceLayoutV2` route-shell cleanup,
2. keep shared wrappers pure and compositional,
3. reduce coupling between shell code and the current monolithic route tree,
4. preserve the current root bootstrap while that structural work happens,
5. then decide whether the runtime should remain static-SPA or move to Workers.

That preserves optionality without forcing the runtime decision too early.

## The Current Options, Stated Plainly

At this point, the discussion converged on three practical models.

### Option 1: Keep the Current SPA + Bootstrap Strategy

Shape:

- `Vite + React + react-router-dom + Convex`
- static hosting
- fast bootstrap shell at `/`
- client takeover for signed-in users

Pros:

- simplest deployment story,
- strongest template simplicity,
- best fit for a Convex-first client app,
- good PWA fit,
- no server runtime required.

Cons:

- the root bootstrap remains a split entry path,
- signed-in users do not get true request-time dashboard rendering at `/`,
- the root shell still feels more custom than ideal.

### Option 2: Move to a Worker-Backed Framework

Shape:

- one app,
- one deployment,
- same `/`,
- Worker runtime does request-time root rendering.

Possible frameworks:

- TanStack Start,
- Next.js on Workers,
- React Router framework on Workers.

Pros:

- cleaner same-URL handling at `/`,
- SSR and request-time personalization,
- more natural framework feature path.

Cons:

- more complex template,
- more operational/runtime cost,
- weaker "simple by default" story.

### Option 3: Separate Landing and Dashboard Routes

Shape:

- `/` is public,
- `/app` is product.

This is structurally the easiest pattern, but it is not what Noter wants right now. The discussion
treated this as a valid industry-default design, but not the current product direction.

## What Should Be Avoided

The following combination should be treated as an explicit anti-pattern for Noter:

- React Router framework mode
- `ssr: false`
- Cloudflare Pages static hosting
- catch-all `__spa-fallback` rewrites for `/`

That combination already failed in production and does not respect the root route contract.

It should not be reintroduced as part of the template story.

## Current Recommendation

The best current recommendation is:

- keep the template as `Vite + React + react-router-dom + Convex`,
- keep the current shell-first root strategy for now,
- keep `WorkspaceLayoutV2` as the structural migration priority,
- treat the bootstrap as temporary but necessary,
- and only move to Workers if request-time rendering at `/` becomes important enough to justify the
  runtime shift.

This is the most honest position for both Noter and future template users.

### How to Explain This to Template Users

A clearer message would be:

- start with a strong SPA baseline,
- keep the code organized so a future framework migration is possible,
- but understand that moving to a server-backed framework later is a real architecture upgrade, not
  a one-line config switch.

That story is simpler and more truthful.

## Decision Heuristic Going Forward

Use this rule of thumb:

### Stay on the current SPA model if:

- SSR is mostly a nice-to-have,
- the template should stay minimal,
- PWA/app-shell behavior is a top priority,
- and Convex remains the center of the runtime model.

### Move to Workers if:

- request-time personalization at `/` becomes important,
- the team wants a cleaner same-URL server-rendered root,
- multiple public routes need strong SEO or server rendering,
- or a Vercel-like full-stack runtime model becomes the actual goal.

## Open Questions

These questions still exist, even though the current recommendation is clear.

1. Should the root bootstrap be reduced further while the app remains SPA-only?
2. Should the public root eventually become a normal route under one runtime once
   `WorkspaceLayoutV2` work is complete?
3. If a Worker migration happens, which framework is the best fit: TanStack Start, Next.js on
   Workers, or React Router framework on Workers?
4. How much offline/PWA behavior should the product guarantee for signed-in users versus anonymous
   users?
5. Should the future template prioritize lowest complexity first, or a richer future migration story
   first?

## Practical Bottom Line

The discussion did not prove that React Router was a mistake.

It proved something narrower and more useful:

- React Router as a client-side library still fits the template well.
- React Router framework mode on Cloudflare Pages is not a safe answer for Noter's root-route
  contract.
- The real tension is between static-first simplicity and request-time root rendering.
- The root bootstrap is currently the price paid for keeping `/` fast, single, and static-hosted.
- If the team wants to stop paying that price, the clean alternative is a Worker runtime, not a
  different static fallback trick.

## Related Repo References

- `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`
- `specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`
- `research/2026-04-07-react-router-cloudflare-pages-routing-incident.md`
- `research/2026-04-07-prebuilt-landing-framework-options.md`
- `apps/noter/src/bootstrap.ts`
- `apps/noter/vite.config.ts`
- `apps/noter/public/_redirects`
