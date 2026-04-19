# TanStack Start on Cloudflare Pages Research

## Status

- Date: April 19, 2026
- Scope: framework and hosting research for future app or template decisions
- Purpose: capture the current evidence around TanStack Start on Cloudflare
  Pages versus TanStack Router on Cloudflare Pages or Workers

## Why This Note Exists

We wanted to answer a practical template question, not just a framework
question:

- can we recommend TanStack Start as a Cloudflare-friendly default,
- can operators deploy it cleanly to Cloudflare Pages,
- and would that choice force downstream users into higher hosting cost or
  runtime complexity than a static Pages app?

This note records the external research so the conclusion does not live only in
chat.

## Executive Summary

- TanStack Start's current first-party Cloudflare story is Workers, not Pages.
- A historical `cloudflare-pages` preset existed, but it was never presented as
  fully reliable.
- The GitHub history shows a pattern of:
  - initial preset exposure,
  - workaround documentation,
  - continued Pages-specific bugs,
  - and later documentation pressure to move Cloudflare guidance from Pages to
    Workers.
- The cost difference is real for template consumers:
  - a static TanStack Router app on Pages can remain effectively zero-cost at
    runtime,
  - while TanStack Start on Workers moves users into the Workers runtime and
    pricing model whenever server execution is part of the default stack.
- We did not find a notable public Twitter/X discussion about this shift. The
  visible discussion lives mainly in GitHub issues, pull requests, and at least
  one linked Discord thread.

## Current Hosting And Pricing Finding

### TanStack Start

The current TanStack Start hosting guide documents Cloudflare via
`cloudflare-workers`, not Cloudflare Pages.

Relevant source:

- [TanStack Start hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)

### Pricing Consequence

For downstream users, the important distinction is not the TanStack license
cost. TanStack is free either way. The difference is Cloudflare runtime cost and
deployment shape.

- A static Pages deployment keeps runtime cost low and can remain zero-cost for
  many projects.
- A Workers deployment can still start on the free tier, but it puts users into
  the Workers billing and runtime model if the framework requires server code by
  default.

Relevant sources:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

## Historical Preset Timeline

### 1. `cloudflare-pages` Was Added, But Already Flagged As Problematic

On July 23, 2024, TanStack merged
[`fix(start): expose "vercel" and "netlify" as target deployment presets` (#2002)](https://github.com/TanStack/router/pull/2002).

The merged commit
[`63018c2`](https://github.com/TanStack/router/commit/63018c2242dbed0d3f32a301a7f43cb220ebd621)
added `cloudflare-pages` as a deployment preset, but the code comment and
runtime warning already treated it as problematic:

- `cloudflare-pages` was listed under `problematicDeploymentPresets`
- the code warned that problematic presets "may not work as expected"

This matters because the preset existed, but it did not arrive with a strong
"this is production-safe" signal.

### 2. Pages Workarounds Were Documented

On November 18, 2024, TanStack merged
[`docs(start): update cloudflare-pages deployment instructions` (#2744)](https://github.com/TanStack/router/pull/2744).

That PR documented a Pages-specific workaround using:

```ts
server: {
  preset: "cloudflare-pages",
  unenv: cloudflare,
}
```

The presence of this docs update confirms that Pages was considered a real path
at that moment, but it also reinforces that extra adapter-specific setup was
needed.

### 3. The Docs Later Shifted Away From Pages

Two later PRs are the clearest signal that the documentation direction moved
from Pages toward Workers:

- [PR #4898](https://github.com/TanStack/router/pull/4898), opened August 9,
  2025: the PR body explicitly says it "Deleted Cloudflare Pages references" and
  "Consolidate Cloudflare guidance around Workers only"
- [PR #5099](https://github.com/TanStack/router/pull/5099), opened September 7,
  2025:
  `docs(Start): change cloudflare pages to workers on deployment target list`

We also found the supporting issue:

- [Issue #4500](https://github.com/TanStack/router/issues/4500), opened June 8,
  2025: `Start: Hosting page is outdated`

We did not find one clean "remove the preset from source" PR. The strongest
visible trail is a docs retreat rather than a single code-removal event.

## Upstream Bug And Friction Trail

The Pages story also shows a long tail of deployment and runtime issues.

### Early And Midstream Pages Problems

- [Issue #3295](https://github.com/TanStack/router/issues/3295):
  `TanStack Start on Cloudflare Pages is broken ("ReadableStream did not return bytes")`
- [Issue #3468](https://github.com/TanStack/router/issues/3468): Cloudflare env
  vars not passed into SSR consistently on Pages or Workers
- [Issue #3932](https://github.com/TanStack/router/issues/3932): static server
  function `_routes.json` output can exceed Cloudflare Pages route limits
- [Issue #4153](https://github.com/TanStack/router/issues/4153): build error
  with `cloudflare_pages` and `cloudflare_workers` Nitro adapters

### Recent Pages Problems

- [Issue #5427](https://github.com/TanStack/router/issues/5427): prerendered
  `404.html` on Pages can hydrate into an empty page
- [Issue #5619](https://github.com/TanStack/router/issues/5619): SPA mode
  hosting details do not work cleanly on Cloudflare Pages
- [Issue #6455](https://github.com/TanStack/router/issues/6455): direct
  navigation to non-root routes in SPA mode causes hydration mismatch on
  Cloudflare
- [PR #6481](https://github.com/TanStack/router/pull/6481): proposed fix for the
  Cloudflare Pages SPA fallback hydration mismatch, still open at the time of
  research
- [Issue #6806](https://github.com/TanStack/router/issues/6806): Pages or
  Wrangler CJS hydration crash on 404 or error pages
- [PR #6814](https://github.com/TanStack/router/pull/6814): proposed fix for
  that hydration crash, closed unmerged on April 15, 2026

The pattern is not "Pages is impossible." The pattern is that Pages has kept
producing special-case bugs and adapter mismatches while Workers became the
clearer first-party story.

## Evidence About Public Discussion

We searched for notable public Twitter/X discussion from TanStack maintainers or
obvious community threads about this shift and did not find a meaningful public
thread.

The visible discussion we could verify lives in:

- GitHub issues and pull requests
- GitHub discussions such as
  [Discussion #2985](https://github.com/TanStack/router/discussions/2985) around
  Cloudflare Pages environment variables
- at least one linked Discord conversation from
  [Issue #5427](https://github.com/TanStack/router/issues/5427)

This is weaker evidence than the GitHub trail, but it suggests the topic was
treated as implementation friction rather than a public social-media-level
announcement.

## Recommendation

If the product or template goal is:

- low default operator cost,
- easy Cloudflare deployment,
- and a static-first baseline that downstream users can keep cheap,

then the safer default is:

- TanStack Router on Cloudflare Pages for the baseline template

If a project truly needs:

- server functions,
- SSR,
- streaming,
- or deeper Worker-runtime behavior,

then the honest recommendation is:

- TanStack Start on Cloudflare Workers

What this research does not support is promising:

- TanStack Start as the default Cloudflare Pages template path

The evidence is too mixed, the docs no longer point there, and the cost model is
less favorable for downstream users than a static Pages baseline.

## Bottom Line

The important conclusion is not that TanStack Start is bad.

The important conclusion is that, as of April 19, 2026:

- TanStack Start plus Cloudflare Pages looks like a legacy or fragile path
- TanStack Start plus Cloudflare Workers looks like the current first-party path
- TanStack Router plus static Pages remains the more operator-friendly default
  when zero-cost static deployment is part of the product promise
