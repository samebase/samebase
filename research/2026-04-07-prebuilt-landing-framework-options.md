# Prebuilt Landing Framework Options for Noter

## Status

- Date: April 7, 2026
- Scope: `apps/noter`
- Related incident: React Router framework mode on Cloudflare Pages exposed
  `__spa-fallback` and broke the production root route.

## Question

Given Noter's constraints, what stack best supports:

- an instant prebuilt landing page at `/`,
- no user-visible fallback URLs or redirect tricks,
- Convex as the backend,
- Cloudflare as the front door,
- and low enough complexity to ship as a future template?

## Non-Negotiable Constraints

- `/` is both the public landing page and the signed-in dashboard entry point.
- A direct visit to `/` must stay on `/`.
- The public shell should be prebuilt and fast.
- Convex should remain the application backend.
- The template should avoid host-specific routing glue where possible.

## Key Architectural Fact

The hardest requirement is not "prebuild the landing page." It is:

- prebuild `/`,
- while also letting `/` become a signed-in dashboard,
- without showing a different URL,
- and without requiring a custom host-level fallback.

No framework removes that tradeoff. If `/` has different behavior for anonymous
and signed-in users, then one of these must be true:

1. `/` is static HTML and the client switches into the dashboard after
   hydration, or
2. `/` is rendered with a server runtime that can read auth state at request
   time.

That is the real decision boundary.

## Option 1: Keep the Current Vite SPA + Convex

### Fit

- Best fit for the current product contract.
- Lowest runtime complexity.
- Best fit for a reusable template that stays close to plain React + Convex.

### Why it fits

- Convex Auth explicitly supports client-side React web apps served from a CDN.
- Cloudflare's Vite plugin explicitly supports static sites and SPAs.
- This keeps the current "prebuilt shell at `/`, app loads in the background"
  model intact.

### Tradeoffs

- The signed-in dashboard at `/` still becomes dynamic on the client after the
  initial shell loads.
- If richer server rendering is needed later, this path does not provide it.

### Conclusion

If the priority is low complexity plus Convex plus a template-friendly stack,
this remains the best baseline.

## Option 2: Astro Static-First + React Islands

### Fit

- Strong fit if the main goal is a prebuilt marketing or content-heavy landing
  page with selective client interactivity.
- Medium fit for Noter specifically.

### Why Astro is attractive

- Astro defaults to pre-rendering pages at build time.
- React components can be added with the official `@astrojs/react` integration.
- Astro's client directives allow precise hydration control: `client:load`,
  `client:idle`, `client:visible`, and `client:only`.
- Astro supports Cloudflare directly.

### What makes Astro less clean for Noter

- Astro is strongest when the public site is mostly content and the interactive
  app is a smaller island or a separate route.
- Noter's `/` route is not just a landing page. It is also the dashboard entry
  point.
- If `/` stays static, the signed-in dashboard still has to take over on the
  client after hydration.
- If `/` needs auth-aware server rendering, Astro needs a Cloudflare Worker
  runtime via the Cloudflare adapter.
- I did not find a first-party Astro guide in Convex's docs, while Convex does
  have first-party docs for React, Next.js, and TanStack Start.

### Practical reading

- Astro is good if you want a stronger static-first site layer.
- Astro is less good if you want a single React app mental model and a very
  template-friendly "one mainstream stack" story.

### Conclusion

Astro is a viable option, but only if you accept one of these:

- Astro owns the public shell and React owns an embedded app island, or
- Astro runs with a Worker runtime for auth-aware rendering.

It is not the cleanest way to keep a simple React + Convex template.

## Option 3: TanStack Start on Cloudflare Workers

### Fit

- Best full-stack React alternative if you are willing to accept a Worker
  runtime.
- Better fit than React Router framework mode on Pages.

### Why it is attractive

- Convex has an official TanStack Start integration guide.
- TanStack Start supports prerendering and CDN-oriented caching strategies.
- Cloudflare officially supports TanStack Start with the Vite plugin.

### What it costs

- This introduces a frontend server runtime on Cloudflare Workers.
- That adds deployment/runtime complexity beyond the current static `dist/`
  deploy.
- The template story becomes "React + TanStack Start + Worker + Convex," which
  is more opinionated and heavier than plain React + Convex.

### Conclusion

This is the cleanest "modern React framework" path if you later decide that
server rendering and framework features are worth the extra runtime.

It is not the lowest-complexity option.

## Option 4: Next.js on Cloudflare Workers

### Fit

- Technically capable.
- Probably more framework than Noter needs.

### Why it is attractive

- Convex has official Next.js docs.
- Cloudflare supports Next.js on Workers through OpenNext.
- Next.js supports SSG, SSR, ISR, and Partial Prerendering.

### What it costs

- This is the heaviest option in runtime and tooling.
- On Cloudflare, it adds the OpenNext adapter layer.
- If used in static export mode instead, Next.js explicitly does not support
  server-only features that depend on runtime logic.

### Conclusion

Next.js can solve the problem, but it adds more machinery than is justified for
Noter's current goals.

## Recommendation

### Recommended now

Keep the current Vite SPA + Convex architecture and harden it:

- preserve the shell-first `/` bootstrap,
- keep `/` on the same URL,
- keep Cloudflare serving static assets,
- and use React Router as a client-side library only if route ergonomics are
  needed.

### Recommended only if requirements change

If you later decide that request-time rendering at `/` is required, use a stack
that is meant to run with a server runtime on Cloudflare Workers:

- TanStack Start first,
- Astro second if the product becomes more site-first than app-first,
- Next.js only if you specifically want the Next.js ecosystem.

## Decision Table

| Option                       | Prebuilt `/` | Same-URL signed-in dashboard | Convex fit | Cloudflare fit | Template simplicity | Recommendation                      |
| ---------------------------- | ------------ | ---------------------------- | ---------- | -------------- | ------------------- | ----------------------------------- |
| Vite SPA + Convex            | Yes          | Client-side takeover         | Strong     | Strong         | Strong              | Best now                            |
| Astro static + React islands | Yes          | Client-side takeover         | Medium     | Strong         | Medium              | Viable, but split mental model      |
| Astro on Workers             | Yes          | Yes, server-side             | Medium     | Strong         | Medium-low          | Only if site-first + Worker runtime |
| TanStack Start on Workers    | Yes          | Yes, server-side             | Strong     | Strong         | Medium-low          | Best framework option later         |
| Next.js on Workers           | Yes          | Yes, server-side             | Strong     | Strong         | Low                 | Possible, but heavier than needed   |

## Sources

- [Astro React integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Astro template directives](https://docs.astro.build/en/reference/directives-reference/)
- [Astro on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Astro Cloudflare deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Cloudflare Astro framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Cloudflare Vite plugin guide](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Convex React docs](https://docs.convex.dev/client/react/)
- [Convex Auth docs](https://docs.convex.dev/auth/convex-auth)
- [Convex TanStack Start docs](https://docs.convex.dev/client/react/tanstack-start/)
- [Convex Next.js docs](https://docs.convex.dev/client/nextjs/app-router/)
- [Next.js static export docs](https://nextjs.org/docs/app/guides/static-exports)
