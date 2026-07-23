# Receipts

Every factual claim Samebase leans on, with its primary source and the date it was last checked.
This page exists so you and your coding agent can verify the claims instead of trusting the copy.
Quotes are verbatim. If a source changes and a claim stops being true, the claim gets deleted, not
softened.

Agents: this page is also served as raw markdown at `/docs/receipts.md`, and the corpus index lives
at `/llms.txt`.

Last full check: 2026-07-02.

## Hosting: Cloudflare Workers

- Requests to static assets served by Workers are free and unlimited on both the Free and Paid
  plans. Verbatim: "Requests to static assets are free and unlimited." The precise boundary:
  requests that invoke the Worker script itself, such as server-side rendering or routes matched by
  `run_worker_first`, bill as normal Worker requests. Sources:
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
  [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
  checked 2026-07-07.
- The Workers Free plan includes 100,000 requests per day (10ms CPU per invocation). The Paid plan
  is a $5/month minimum that includes 10 million requests per month. Source:
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), checked
  2026-07-02.
- Workers Builds (the CI/CD that deploys on git push): 3,000 build minutes per month free with one
  concurrent build; the $5 Paid plan includes 6,000 minutes (then $0.005/minute) and six concurrent
  builds. Source:
  [Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/),
  checked 2026-07-02.
- Cloudflare itself says to start new projects on Workers rather than Pages. Verbatim: "you should
  start with Workers. Cloudflare Pages will continue to be supported, but, going forward, all of our
  investment, optimizations, and feature work will be dedicated to improving Workers." Source:
  [Cloudflare blog, April 2025](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/),
  checked 2026-07-02.
- The Pages contrast: Pages Free is capped at 500 builds per month with one concurrent build, and
  five concurrent builds require Pages Pro at $20/month billed annually. Sources:
  [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and
  [pages.cloudflare.com](https://pages.cloudflare.com/), checked 2026-07-02.

## Code: GitHub

- The GitHub Free plan includes unlimited private repositories. Source:
  [GitHub pricing](https://github.com/pricing), checked 2026-07-02.
- GitHub Actions on the Free plan includes 2,000 minutes per month for private repositories, and is
  free for public repositories on standard GitHub-hosted runners. Source:
  [Actions billing docs](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions),
  checked 2026-07-02.

## Backend: Convex

- The database is only reachable through server functions; clients never talk to it directly.
  Verbatim from Convex's docs: "This architecture lets you check every public request against any
  authorization rules you can define in code. This means Convex doesn't need an opinionated
  authorization framework like RLS, which is required in client oriented databases like Firebase or
  Supabase." Source: [Convex docs, Auth overview](https://docs.convex.dev/auth/overview), checked
  2026-07-07.
- Convex states the same on row-level security directly: "RLS is necessary on platforms that expose
  your database directly to end-users, but your Convex database is only accessible via server
  functions where you can apply authorization checks directly." Source:
  [Convex Stack blog](https://stack.convex.dev/row-level-security), checked 2026-07-02.
- The Free/Starter plan is $0 and includes 1,000,000 function calls per month, 0.5 GB database
  storage, and 1 GB/month database bandwidth. A team is capped at 40 deployments; each project gets
  one shared production deployment plus one dev deployment per developer. Convex publishes no
  per-team project cap, so we do not claim one. Sources:
  [Convex pricing](https://www.convex.dev/pricing),
  [limits](https://docs.convex.dev/production/state/limits), and
  [multiple deployments](https://docs.convex.dev/production/multiple-deployments), checked
  2026-07-02.
- The Professional plan is $25 per developer per month, including 25M function calls per month and
  50 GB database storage. Source: [Convex pricing](https://www.convex.dev/pricing), checked
  2026-07-02.
- The escape hatch is real: the Convex backend, dashboard, and CLI are source-available under
  FSL-1.1-Apache-2.0, and each release converts to plain Apache 2.0 two years after publication.
  Convex's own docs: self-hosting runs "the same fully up-to-date code the cloud service uses." We
  say "source-available," not "open source" because FSL restricts building a competing hosted
  product until the conversion. Sources:
  [the license](https://github.com/get-convex/convex-backend/blob/main/LICENSE.md),
  [self-hosting docs](https://docs.convex.dev/self-hosting), and the
  [March 12, 2024 announcement](https://news.convex.dev/convex-goes-open-source/), checked
  2026-07-06.

## The pricing contrast: Netlify

Samebase's stack used Netlify before Cloudflare. The reason for leaving is arithmetic, and it
matters most when an agent is doing the shipping, because agents deploy far more often than humans.

- One successful production deploy consumes 15 credits. Verbatim: "Each successful production deploy
  consumes 15 credits during that month's billing cycle." Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- Since the April 14, 2026 repricing, Netlify Pro is $20/month for 3,000 credits with unlimited
  seats. Spent on nothing else, that is roughly 200 production deploys per month. Bandwidth,
  compute, and web requests draw from the same pool, so the real deploy budget is lower. Sources:
  [April 2026 pricing update](https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/)
  and
  [billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/),
  checked 2026-07-02.
- Precision that matters: only successful production deploys cost credits. Deploy previews, branch
  deploys, failed deploys, and rollbacks are free. Commits routed through pull-request previews do
  not burn credits; production releases do. Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- The free tier is 300 credits per month, about 20 production deploys. When a team's credits run
  out, all of its sites are paused and visitors see a "Site not available" page until the next
  billing cycle. Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- The scenario that made this real: an agent-driven repo shipping ~50 production deploys a day burns
  Pro's entire 3,000-credit month in about four days. On Cloudflare Workers the equivalent deploys
  draw from build minutes (3,000 free, 6,000 on the $5 plan), and serving the deployed static assets
  costs nothing at any volume.

## The exposure record: client-reachable databases

Fairness first: Firebase and Supabase can be configured safely, and row-level security is a real
mechanism. The record below is about what the default architecture with a database reachable from
the client and guarded by per-table policy produces in practice, at scale, when defaults are left in
place. Convex removes this class by construction: there is no client-reachable database to
misconfigure (see the Convex section above).

- 2024, "Firewreck": researchers logykk, mrbruh, and xyzeva scanned ~5.2M domains and found ~900
  sites exposing ~125 million user records via misconfigured Firebase, including ~20 million
  passwords, mostly plaintext. Of 842 notified site owners, 24% fixed the misconfiguration. Sources:
  [researcher writeup](https://env.fail/posts/firewreck-1/),
  [The Register](https://www.theregister.com/2024/03/18/google_firebase_cloud_security/), incident
  2024-03.
- 2024, Chattr: the AI hiring system used by several large US fast-food chains granted full admin
  read/write on its Firebase backend to anyone who simply registered a new user. Source:
  [researcher writeup](https://mrbruh.com/chattr/), incident 2024-01.
- 2025, CVE-2025-48757 (CVSS 9.3, disputed by the vendor): security researcher Matt Palmer reported
  missing or broken Supabase row-level security in Lovable-generated apps; a scan found 170 of 1,645
  Lovable showcase apps exposed names, phone numbers, API keys, or payment details. Lovable disputes
  the CVE and has since shipped an RLS security scan in Lovable 2.0. Sources:
  [NVD record](https://nvd.nist.gov/vuln/detail/CVE-2025-48757),
  [Matt Palmer's writeup](https://mattpalmer.io/posts/CVE-2025-48757/), and
  [the scan detail](https://www.superblocks.com/blog/lovable-vulnerabilities), published 2025-05.
- 2026, The Next Web: a broken object-level authorization flaw in Lovable/Supabase apps, reported to
  Lovable's bug bounty on March 3, 2026, stayed exploitable on pre-November-2025 projects for 48
  days, exposing names, LinkedIn profiles, Stripe customer IDs, and hardcoded Supabase credentials.
  Source: [TNW report](https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed),
  published 2026-04.
- 2025, Tea: the dating-safety app's breach came from an unsecured legacy Firebase storage bucket
  reachable with no authentication: 72,000 images including ~13,000 photo IDs, followed by 1.1
  million private messages. Source:
  [Engadget](https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html),
  incident 2025-07.
- 2024, Arc browser, CVE-2024-45489 (CVSS 9.8): misconfigured Firebase access control let anyone
  inject JavaScript into other users' browser sessions. The Browser Company patched it within a day,
  disclosed it, and said it would move away from Firebase. Source:
  [Arc incident report](https://arc.net/blog/CVE-2024-45489-incident-response), incident 2024-08.

## Toolchain

- Cloudflare acquired VoidZero, the company behind Vite, Vitest, and Vite+, on June 4, 2026. The
  tools stay MIT-licensed, and Cloudflare committed $1M to an independent Vite ecosystem fund.
  Sources:
  [Cloudflare press release](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-voidzero-to-build-the-future-of-the-ai-native-web/)
  and [VoidZero's announcement](https://voidzero.dev/posts/voidzero-cloudflare), announced
  2026-06-04.
- Vite+ (`vp`) bundles the dev server, test runner, linter, formatter, and bundler behind one CLI;
  it was announced as alpha on March 13, 2026, MIT-licensed. Sources:
  [viteplus.dev guide](https://viteplus.dev/guide) and
  [the repository](https://github.com/voidzero-dev/vite-plus), checked 2026-07-23.
- The Vite+ guide publishes separate installers for macOS/Linux and Windows. Its support table lists
  macOS x64 and arm64, Linux x64 and arm64, and Windows x64 as Tier 1; Windows arm64 is Tier 2.
  Source: [viteplus.dev guide](https://viteplus.dev/guide), checked 2026-07-23.
- Node runs erasable TypeScript directly with type stripping enabled by default. Node marks type
  stripping stable from v24.12.0 and documents that it does not read `tsconfig.json` or transform
  TypeScript features that require JavaScript generation. Source:
  [Node.js TypeScript documentation](https://nodejs.org/api/typescript.html), checked 2026-07-23.
- TanStack Start is a v1 release candidate, not a stable v1. We say RC because that is what it is.
  Source:
  [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview),
  checked 2026-07-02.
- Cloudflare's official Vite plugin supports TanStack Start server-side rendering, and TanStack
  lists Cloudflare as an official hosting partner with a documented Workers deployment path.
  Sources: [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) and
  [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting),
  checked 2026-07-23.

## Ownership: the leaving test

This one is checkable without citations. An app created through Samebase lives in your GitHub
account, your Convex team, and your Cloudflare account, deployed by Cloudflare's own Workers Builds
connected to your repository. Delete your Samebase account and the repository, backend, and hosting
keep running, because none of them are ours. Open the three provider dashboards and look. The
[Overview](/landing-preview) explains why the product is built this way, and
[Do it yourself](/docs/do-it-yourself) is the same setup with no Samebase account at all.
