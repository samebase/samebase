# Markdown-Ready Site Research

Date: 2026-04-22

## Why This Note Exists

The user asked how to make `noter.md` "markdown ready" in the sense used by the
current Markdown-for-agents push: a canonical public URL should be able to
return Markdown when the client sends an `Accept` header that prefers
`text/markdown`.

This note answers three practical questions:

1. What does the live site do today?
2. What does the current repo already have that we can reuse?
3. What implementation path best fits Noter's existing Cloudflare Pages plus
   Vite architecture?

## Why This Lives In `research/`

This is current-state investigation plus an implementation recommendation. It is
not yet an accepted product or hosting contract, so `research/` is the right
home for it.

## Bottom Line

As of April 22, 2026, `noter.md` is not markdown ready.

The live homepage and public legal pages still return `text/html` even when the
request sends `Accept: text/markdown`, and those responses do not advertise
`Vary: Accept`.

The repo already has a strong starting point for exact public content routes:

- `apps/noter/src/content/privacy-policy.md`
- `apps/noter/src/content/terms-of-service.md`
- `apps/noter/src/lib/staticLegalPage.ts`
- `apps/noter/vite.config.ts`
- `apps/noter/public/_redirects`

The main gap is `/`.

`/privacy` and `/terms` already have repo-owned Markdown source and generated
public HTML. `/` does not. The homepage still ships as a JavaScript app shell
with metadata plus an empty `#root`, while the actual landing copy lives inside
React code.

That means the best-fit implementation for Noter is:

1. add exact-route Cloudflare Pages Functions for `/`, `/privacy`, and `/terms`
   that negotiate between HTML and Markdown on the canonical URL,
2. keep one repo-owned Markdown source per public route,
3. move the landing copy for `/` into a real content file instead of keeping it
   only inside TypeScript constants and components.

## What The Live Site Does Today

I tested the current production site on April 22, 2026 with `curl`.

Observed behavior:

- `GET https://noter.md/` returns `200` with
  `Content-Type: text/html; charset=utf-8`
- `GET https://noter.md/` with `Accept: text/markdown` still returns `200` with
  `Content-Type: text/html; charset=utf-8`
- `GET https://noter.md/privacy/` with `Accept: text/markdown` still returns
  `200` with `Content-Type: text/html; charset=utf-8`
- `GET https://noter.md/` with `Accept: application/x-does-not-exist` still
  returns `200` with `Content-Type: text/html; charset=utf-8`
- those responses do not include `Vary: Accept`

Practical conclusion:

- the current site does not negotiate HTML versus Markdown at the canonical
  public URLs,
- it therefore does not meet the expected agent-facing behavior for a
  markdown-ready site,
- and it would fail a stricter checker that expects real content negotiation.

## What The Repo Already Has

### 1. Static public legal pages from repo-owned Markdown

`apps/noter/src/lib/staticLegalPage.ts` already renders a constrained Markdown
subset into a full public HTML document for `/privacy` and `/terms`.

`apps/noter/vite.config.ts` already reads the repo Markdown files and writes the
generated public HTML files during build:

- `apps/noter/src/content/privacy-policy.md`
- `apps/noter/src/content/terms-of-service.md`
- `apps/noter/public/privacy/index.html`
- `apps/noter/public/terms/index.html`

This is exactly the kind of content-first public route shape we want to reuse.

### 2. Exact public route handling before the SPA fallback

`apps/noter/public/_redirects` currently routes:

- `/privacy` to `/privacy/index.html`
- `/terms` to `/terms/index.html`
- everything else to `/index.html`

That exact-route-first pattern is useful because Markdown readiness should start
with known public routes, not with a global catch-all that touches the whole
app.

### 3. The homepage copy already exists in a Markdown-like form

`apps/noter/src/lib/landingCopy.ts` already builds `landingPageMarkdown` from:

- a chosen slogan
- a small bullet list

`apps/noter/src/SignInForm.tsx` uses that content to render the public landing
copy in the logged-out root experience.

So the homepage content does not need a new CMS or a new authoring system. It
does need to move into a real public content source if we want a clean canonical
Markdown representation for `/`.

## The Key Constraint: `/` Is Still A Shell At Origin

`apps/noter/index.html` currently ships the public metadata and boot scripts,
but the body content is still just:

- `<div id="root"></div>`
- a client entry script

That matters because Cloudflare's managed Markdown-for-agents feature converts
the HTML your origin already serves.

Inference from Cloudflare's docs plus the current repo shape:

- Cloudflare can help immediately for routes that already return real public
  HTML documents,
- but for `/` it would mostly convert the shell unless we either:
  - give `/` a real public HTML body at origin, or
  - serve Markdown for `/` directly from a Pages Function or Worker.

## What "Markdown Ready" Actually Requires

From the HTTP and Cloudflare docs, the important behavior is:

- the canonical URL stays the same,
- the server negotiates representations using the `Accept` header,
- the Markdown representation returns `Content-Type: text/markdown`,
- negotiated responses should advertise `Vary: Accept`,
- `Accept` parsing must honor q-values and specificity instead of substring
  matching.

For unsupported `Accept` values, RFC 9110 allows a server to either ignore the
header and still serve a default representation or return `406 Not Acceptable`.

Practical recommendation for Noter:

- if the goal is only graceful compatibility, falling back to HTML is allowed,
- if the goal is a stricter "markdown ready" posture, return `406` only when the
  client explicitly rules out every representation we can serve.

## Best-Fit Implementation For Noter

### Recommendation

Use exact-route Cloudflare Pages Functions for:

- `/`
- `/privacy`
- `/terms`

Behavior:

- if `Accept` prefers Markdown, return the Markdown variant directly,
- otherwise fall through to the existing HTML asset or generated page.

Why this fits Noter well:

- it preserves the current Vite plus Pages deployment model,
- it avoids routing the whole application through a server runtime,
- it keeps the feature limited to known public routes,
- it works even while `/` remains a client-rendered app shell for browsers,
- and it matches the repo's current preference for exact public pages instead of
  broad framework migration.

### Content source recommendation

For `/privacy` and `/terms`, keep using the existing Markdown source files.

For `/`, create a real content file, for example:

- `apps/noter/src/content/home.md`

Then make both of these derive from that file:

- the Markdown response for `GET /` when Markdown is negotiated
- any future static or pre-rendered public homepage HTML

That is cleaner than keeping the canonical public landing copy only inside
TypeScript constants.

### Scope recommendation

Do not start with a catch-all function for the entire app.

Reasons:

- only a few routes are truly public content routes,
- Pages Functions requests count against Workers usage,
- exact-route functions keep the change auditable and low-risk,
- private app routes should not accidentally start advertising alternate public
  representations.

## Optional Follow-Ups

### 1. Turn on Cloudflare Markdown for Agents on already-static public pages

Once a route returns real public HTML at origin, Cloudflare's managed feature is
still useful. The docs say it:

- is available on Pro, Business, and Enterprise plans at no cost,
- can be enabled by path with Configuration Rules,
- and currently converts HTML responses up to 2 MB.

That is a good fit for:

- `/privacy`
- `/terms`
- future static public docs or landing pages

It is not enough by itself for the current `/` shell.

### 2. Add a real `/llms.txt`

This should be treated as supplemental, not as the primary solution.

Right now `https://noter.md/llms.txt` falls through to the SPA HTML response,
which means the site does not currently expose a real `llms.txt` asset. If we
add one, it should be a real static file under `apps/noter/public/`.

### 3. Unify public content rendering

Longer-term, the public site would be cleaner if the same repo-owned Markdown
source could generate:

- canonical Markdown responses for agents,
- static HTML for bots and no-JS users,
- and any small in-app rendered variants that reuse the same copy.

The legal-page pipeline already points in that direction.

## Recommended Rollout Order

1. Add a research-only implementation plan for exact-route Markdown negotiation.
2. Add `apps/noter/src/content/home.md`.
3. Add Pages Functions for `/`, `/privacy`, and `/terms`.
4. Add tests that cover:
   - `Accept: text/markdown`
   - normal browser HTML requests
   - `Vary: Accept`
   - q-value preference handling
   - optional `406` behavior if we choose the stricter path
5. Optionally enable Cloudflare's managed Markdown-for-agents feature for routes
   that already serve rich static HTML.

## Sources

External sources:

- Cloudflare: Markdown for Agents
  `https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/`
- Cloudflare: Pages Functions getting started
  `https://developers.cloudflare.com/pages/functions/get-started/`
- Cloudflare: Pages Functions pricing
  `https://developers.cloudflare.com/pages/functions/pricing/`
- RFC 7763: The `text/markdown` Media Type
  `https://www.rfc-editor.org/rfc/rfc7763`
- RFC 9110: HTTP Semantics `https://www.rfc-editor.org/rfc/rfc9110`

Repo sources inspected:

- `apps/noter/index.html`
- `apps/noter/public/_redirects`
- `apps/noter/src/SignInForm.tsx`
- `apps/noter/src/lib/landingCopy.ts`
- `apps/noter/src/lib/staticLegalPage.ts`
- `apps/noter/vite.config.ts`
- `notes/noter-seo-research-2026-03-19.md`
- `research/2026-04-08-root-route-framework-discussion-summary.md`
