# Noter SEO research

Date: 2026-03-19

## Goal

Capture the SEO research relevant to Noter's current product shape and deployment so a future PR can
improve discoverability without indexing the wrong parts of the product.

## Executive summary

Noter does not currently have a "small on-page SEO tweaks" problem. It has a public-surface problem.

The logged-out experience is a lightweight landing shell plus waitlist/login, while the real product
value lives behind authentication. Search engines can render the current homepage content after
JavaScript, but the site still has critical crawl/index issues and almost no public information
architecture to rank with.

The highest-leverage direction is:

1. Keep the private app mostly out of the index.
2. Build a real public marketing and docs surface on `noter.md`.
3. Give each public page a stable topic, title, canonical URL, and supporting content.
4. Fix the current crawl hygiene issues before doing content work.

## Product and surface reviewed

Local product references reviewed:

- `README.md`
- `apps/noter/index.html`
- `apps/noter/src/bootstrap.ts`
- `apps/noter/src/SignInForm.tsx`
- `apps/noter/src/App.tsx`
- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/noter/src/components/ChatFab.tsx`
- `slogans.md`

Live production checks reviewed:

- `https://noter.md/`
- `https://noter.md/robots.txt`
- `https://noter.md/sitemap.xml`
- rendered DOM for `/` and `/pricing`
- Lighthouse SEO/performance snapshot for the homepage

## Confirmed current findings

### 1. Google-style rendering can see the homepage content

The public landing shell is rendered by the bootstrap path before the main app hydrates. That means
crawlers that execute JavaScript can see a real H1 and body copy on the homepage, even though the
initial HTML is sparse.

Relevant local references:

- `apps/noter/src/bootstrap.ts`
- `apps/noter/src/SignInForm.tsx`

Implication:

- Noter is not blocked on full SSR just to get the homepage indexed.
- However, this is still a brittle base compared with statically rendered public pages.

### 2. The default metadata is generic

The base document currently ships:

- title: `noter`
- description: `Code Editor`

Relevant local reference:

- `apps/noter/index.html`

Implication:

- current metadata does not describe the product category or use case
- even if pages are indexed, the snippets are weak and non-differentiated

### 3. `robots.txt` is currently invalid in production

Live verification on 2026-03-18 and 2026-03-19 showed:

- `https://noter.md/robots.txt` returns `content-type: text/html`
- the response includes robots directives followed by the app HTML document

Implication:

- this is a real crawlability defect and should be fixed before other SEO work
- Lighthouse explicitly flags the homepage with `robots.txt is not valid`

### 4. `sitemap.xml` is missing and currently falls through to the SPA

Live verification showed:

- `https://noter.md/sitemap.xml` returns the HTML app shell instead of sitemap XML

Implication:

- Search Console has no proper sitemap feed to consume
- index discovery is weaker than it should be even for the few public URLs that exist

### 5. Public route differentiation is very limited

The current route tree is mostly app routes behind authentication. Logged-out users are effectively
funneled to the landing/sign-in surface.

Relevant local references:

- `apps/noter/src/App.tsx`
- `apps/noter/src/SignInForm.tsx`

Implication:

- there are too few public pages to target distinct search intents
- the app currently lacks a public acquisition surface beyond the homepage

### 6. Unauthenticated deep routes can collapse to the same landing content

A rendered check of `/pricing` while unauthenticated produced the landing page content instead of a
distinct public pricing document.

Implication:

- multiple URLs can expose essentially the same content under `200`
- this creates duplicate and soft-404-style risk unless canonicals, `noindex`, or real public page
  rendering are added intentionally

### 7. Homepage positioning is unstable because the slogan rotates

The landing copy uses slogan rotation sourced from `slogans.md`.

Examples currently include:

- `noter is a collaborative markdown workspace on top of GitHub`
- `noter: build MCP servers for ChatGPT`
- `noter: orchestrate multiple agents from anywhere via MCP`
- `noter is a dev environment for your codex agent`

Relevant local references:

- `slogans.md`
- `apps/noter/src/bootstrap.ts`

Implication:

- this is useful for experimentation but weak for consistent topical relevance
- the homepage should have one stable primary thesis, not many competing ones

### 8. Performance is already good enough not to be the first blocker

Lighthouse snapshots on the homepage were strong:

- desktop performance: `0.95`
- mobile performance: `0.99`
- SEO category: `0.92`
- LCP was in a reasonable range for both checks

The explicit SEO failure that surfaced was invalid `robots.txt`.

Implication:

- the first SEO wins are crawl hygiene, page architecture, and content strategy
- performance work is still useful, but it is not the main constraint today

### 9. There is no visible canonical or structured-data layer yet

Live homepage checks found no canonical link element and no JSON-LD block.

Implication:

- Google has less help understanding preferred URLs and site identity
- Noter is not using basic `Organization` / `WebSite` structured data yet

## Recommended search positioning

Noter should not try to win broad head terms like:

- `code editor`
- `AI IDE`
- `collaborative editor`

Those spaces are too broad and too crowded for the current public footprint.

The better approach is to pick a narrower primary wedge and support adjacent wedges with dedicated
pages.

The strongest candidates based on the current product are:

- GitHub-backed collaborative markdown and code workspace
- web-based dev environment for AI agents
- build and manage MCP servers for ChatGPT
- approval-first AI operations for production reads

Recommended homepage thesis:

- position Noter primarily as a GitHub-backed workspace for AI agents and human operators

Why this is the best fit:

- it aligns with the actual product
- it is more specific than `code editor`
- it still leaves room for MCP, mobile operations, and approval-first AI flows as secondary pages

## Recommended public information architecture

Noter needs more indexable, intent-specific public pages. A practical first pass:

- `/`
  - stable homepage with one clear thesis, real product screenshots, primary CTA
- `/pricing`
  - real public pricing page, not auth-gated landing fallback
- `/mcp`
  - explain MCP support, setup, use cases, and how Noter fits ChatGPT/Codex
- `/ai-agent-workspace`
  - explain the workspace and operator model for AI agents
- `/github-workspace`
  - explain GitHub-backed workflows, repo ownership, and collaboration
- `/compare/noter-vs-codespaces`
  - comparison page for a real adjacent query space
- `/compare/noter-vs-lovable`
  - only if the comparison is honest and grounded in visible product behavior
- `/learn/...`
  - docs/guides/tutorials targeting first-hand operational knowledge

Important principle:

- public pages should be indexable
- app routes, auth flows, consent flows, and per-vault routes should generally be `noindex` or
  otherwise kept out of Search

## Technical SEO recommendations

### 1. Fix crawl hygiene immediately

Required near-term fixes:

- serve a valid plain-text `robots.txt`
- serve a real XML sitemap at `/sitemap.xml`
- include only public canonical URLs in the sitemap
- add `lastmod` values for public pages

### 2. Add route-level metadata for every public page

Each public page should have:

- unique title
- unique meta description
- canonical URL
- Open Graph title, description, image, and URL
- stable H1 aligned with the page topic

The current base metadata is too generic to carry production SEO.

### 3. Add canonical control and deindex private surfaces

For private or utility routes, use one of:

- `noindex`
- proper auth status handling
- real 404 behavior for non-public pages

Do not let multiple logged-out URLs return the same landing body under `200` without explicit
canonical handling.

### 4. Add structured data for core site identity

Start with:

- `Organization`
- `WebSite`

Potentially add later where appropriate:

- `SoftwareApplication`
- `BreadcrumbList`

Only add schema that matches visible on-page content.

### 5. Prefer statically rendered public pages even if the app remains SPA-based

The current JavaScript-rendered landing is indexable enough to work, but statically rendering public
marketing pages would still be better for:

- crawl predictability
- metadata correctness
- easier canonical control
- simpler sharing previews

This does not require converting the private app to SSR. It only requires a more intentional public
surface.

### 6. Keep titles and messaging stable

Avoid homepage H1 rotation for the main public page.

A better pattern is:

- one stable homepage thesis
- experiments run on subhead, CTA copy, design, or dedicated landing pages

## Content strategy recommendations

Noter will benefit most from first-hand, product-specific content rather than generic SEO blog
output.

High-value content types:

- setup guides for MCP with ChatGPT and Codex
- explainers for approval-first AI production access
- comparisons versus existing developer workflows
- product walkthroughs with screenshots
- real examples of GitHub-backed collaborative editing
- case studies or internal build logs once available

Low-value content types:

- generic `what is SEO for SaaS`
- generic `what is AI coding`
- broad thought-leadership posts detached from product usage

The content bar should be:

- first-hand
- technically specific
- visibly tied to real product capabilities

## Measurement recommendations

Use Search Console as the primary measurement tool after shipping the basics.

Initial setup:

- verify the domain property for `noter.md`
- submit the sitemap
- inspect the homepage and each public landing page

Metrics to watch first:

- indexed pages
- branded vs non-branded queries
- impressions and CTR for the homepage and key landing pages
- duplicate, soft-404, and excluded URL patterns

Do not treat `site:noter.md` as authoritative. It is useful as a rough check, but Google documents
that the `site:` operator is not exhaustive.

## Recommended implementation order

### Phase 1: fix broken crawl signals

1. Ship a valid `robots.txt`
2. Ship a real `sitemap.xml`
3. Add canonical tags
4. Add real page metadata for existing public pages

### Phase 2: separate public SEO surface from private app surface

1. Introduce stable public routes for homepage, pricing, and key product pages
2. Keep app/auth/private routes out of the index
3. Ensure logged-out deep links do not all collapse into the same landing page

### Phase 3: content and positioning

1. Pick one homepage thesis
2. Build adjacent landing pages around real search intents
3. Publish technically credible guides and comparisons

### Phase 4: iterate from data

1. Review Search Console query and indexing data
2. Improve titles, descriptions, and page focus based on observed demand
3. Expand only the pages that are already showing traction

## Suggested first PR scope

If the goal is a focused implementation PR after this research, the best first scope is:

- add a valid `robots.txt`
- add a real `sitemap.xml`
- add canonical support
- replace the generic homepage title and description
- make `/pricing` a distinct public page when logged out, or explicitly remove it from indexing
  until it is real

That is the highest signal-to-effort starting point.

## Sources

Primary guidance:

- Google Search technical requirements:
  `https://developers.google.com/search/docs/essentials/technical`
- Google SEO starter guide:
  `https://developers.google.com/search/docs/fundamentals/seo-starter-guide`
- Google JavaScript SEO basics:
  `https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics`
- Google helpful content guidance:
  `https://developers.google.com/search/docs/fundamentals/creating-helpful-content`
- Google snippet and meta description guidance:
  `https://developers.google.com/search/docs/appearance/snippet`
- Google canonical URL guidance:
  `https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls`
- Google sitemap guidance:
  `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`
- Google robots meta tag guidance:
  `https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag`
- Google AI features in Search: `https://developers.google.com/search/docs/appearance/ai-features`
- Google page experience guidance:
  `https://developers.google.com/search/docs/appearance/page-experience`
- Google note about `site:` operator limitations:
  `https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site`

Live production checks:

- `https://noter.md/`
- `https://noter.md/robots.txt`
- `https://noter.md/sitemap.xml`
