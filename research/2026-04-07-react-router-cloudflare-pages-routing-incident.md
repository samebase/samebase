# React Router Framework and Cloudflare Pages Routing Incident

## Status

- Date: April 7, 2026
- Scope: `apps/noter`
- Related production incident: `noter.md` redirected users to `/__spa-fallback`
  after the React Router framework migration landed and the follow-up hotfix
  attempted to recover on Cloudflare Pages.

## Summary

The regression was not just a bad redirect line. It was a mismatch between:

- React Router's generic static-hosting guidance for `ssr:false` plus
  pre-rendering, and
- Cloudflare's actual supported deployment path for React Router framework mode.

For Noter's product requirement, the important invariant is:

- A direct visit to `/` must render immediately and remain on `/`.
- Internal fallback paths such as `__spa-fallback` must never become
  user-visible.

Static Cloudflare Pages rewrites did not provide a safe way to satisfy that
contract once the app moved to React Router framework mode with:

- `ssr: false`
- `prerender: ["/"]`
- a catch-all SPA fallback

## Official Source Findings

### React Router

React Router's pre-rendering docs explicitly describe the static-hosting
fallback pattern for `ssr:false`:

- With `ssr:false`, pre-rendering can be served from a static file server.
- If `/` is pre-rendered, React Router writes the SPA fallback to
  `build/client/__spa-fallback.html`.
- The docs show a generic host example using: `/* /__spa-fallback.html 200`.

Source:

- [React Router pre-rendering docs](https://reactrouter.com/how-to/pre-rendering)

### Cloudflare

Cloudflare's official React Router guide points in a different direction:

- Their supported framework path is React Router on Workers.
- The generated project uses `ssr: true`.
- Cloudflare explicitly says: SPA mode and prerendering are not currently
  supported when using the Cloudflare Vite plugin.
- If you want an SPA on Cloudflare, Cloudflare recommends starting from the
  React template and using React Router as a library.

Source:

- [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)

Cloudflare's Pages docs also matter here:

- `_redirects` rules always run when they match.
- Pages proxy/rewrite rules are relative-path only and only the first redirect
  applies.
- `_redirects` are not applied to requests served by Pages Functions.
- In Pages advanced mode, `_worker.js` takes full control of all requests and
  must explicitly forward asset requests with `env.ASSETS.fetch(request)`.

Sources:

- [Cloudflare Pages redirects docs](https://developers.cloudflare.com/pages/configuration/redirects/)
- [Cloudflare Pages advanced mode docs](https://developers.cloudflare.com/pages/functions/advanced-mode/)

## Local Reproduction

Two small fixtures were reproduced locally with
`pnpm dlx wrangler@4.80.0 pages dev`.

### Fixture A: React Router-style fallback rewrite

Fixture contents:

- `index.html`
- `__spa-fallback.html`
- `_redirects` containing: `/* /__spa-fallback.html 200`

Observed behavior under Cloudflare Pages emulation:

- `GET /` returned `308 Location: /__spa-fallback`
- `GET /__spa-fallback` returned `308 Location: /__spa-fallback`
- `GET /__spa-fallback.html` returned `308 Location: /__spa-fallback`

This reproduces the production failure mode directly.

### Fixture B: Attempted root override plus fallback rewrite

Fixture contents:

- `index.html`
- `__spa-fallback.html`
- `_redirects` containing: `/ /index.html 200` `/* /__spa-fallback 200`

Observed behavior under Cloudflare Pages emulation:

- Wrangler reported the `/ /index.html 200` rule as an infinite loop and ignored
  it.
- `GET /` still returned the fallback document instead of the real root
  document.

This reproduces why the follow-up fix still surfaced the wrong document at `/`.

## What This Means for Noter

The current safe production baseline is the reverted Vite SPA with the explicit
shell-first bootstrap documented in
`specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`.

For Noter, there are only two safe strategic directions:

### Option A: Stay on the current Vite SPA for the public landing path

Use React Router as a client-side library inside the existing app, preserve the
current shell-first bootstrap, and keep Cloudflare Pages serving `dist/`.

This matches:

- the current production setup,
- the current landing-page spec,
- and Cloudflare's explicit recommendation for SPA use cases.

### Option B: Move React Router framework mode to a Worker runtime

If Noter wants actual React Router framework mode, deploy it as a server-backed
app on Cloudflare Workers with `ssr:true`, not as a static Pages SPA fallback.

That allows:

- `/` to be rendered directly without rewriting to `__spa-fallback`,
- route handling to happen in the Worker runtime instead of `_redirects`,
- and the landing page to be optimized with SSR plus route-level lazy loading
  instead of a host-level fallback trick.

### Option C: Avoid

Do not reintroduce this combination on Noter's Pages deployment:

- React Router framework mode
- `ssr:false`
- `prerender: ["/"]`
- `/* /__spa-fallback.html 200`

Do not rely on Pages advanced mode as the primary fix either. Advanced mode can
be made to work, but it transfers all routing correctness onto a custom
`_worker.js` and bypasses `_redirects` entirely. That is more host-specific glue
than the current Vite bootstrap and not the cleanest path for this migration.

## Recommended Path Forward

1. Keep production on the reverted Vite SPA and preserve the current landing
   shell contract.
2. Add regression tests that codify the Cloudflare Pages failure modes.
3. Block reintroduction of the unsupported React Router `ssr:false` framework
   setup through repo tests.
4. If React Router framework adoption remains a goal, prototype it separately on
   Cloudflare Workers with `ssr:true` and validate it against the landing-page
   spec before another production attempt.

## Guardrails Added in This Change

- A landing-page spec update that explicitly forbids user-visible fallback URLs
  for `/`.
- A Cloudflare Pages emulator test that reproduces:
  - the `__spa-fallback.html` redirect loop, and
  - the ignored `/ -> /index.html` override rule.
- A deployment guard test that bans internal fallback paths from Noter's current
  `_redirects` file and bans reintroducing React Router `ssr:false` framework
  mode without an explicit deployment rethink.
