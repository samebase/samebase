# Landing Copy Receipts — Verified Sources

## Status

- Status: research / verified source material behind the landing-page claims.
- Date: 2026-07-02. All values as of the cited source dates; re-verify before major republishing.
- Produced by a sub-agent research sweep; each fact carries a verdict against the operator's
  recollection.
- Companion to `research/2026-07-02-landing-copy-interview.md`.
- Related PR: https://github.com/samebase/samebase/pull/1112

## Netlify Pricing

- **[confirmed]** Netlify Pro costs ~$20/month and includes ~3,000 credits
  - $20/month, 3,000 credits/month (Pro plan, now with unlimited team seats). Note: at launch
    (Sept 2025) Pro was $20/member/month
    with 5,000 credits; the April 14, 2026 update changed it to a flat $20 for 3,000 credits with
    unlimited seats.
  - Quote: "The Credit Pro plan now includes free unlimited team member seats with a monthly
    subscription ... $20 for 3,000 credits."
  - Source:
    [Pricing updates for Credit-based plans | Netlify Changelog](https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/)
    (as of 2026-04)
- **[confirmed]** One production deploy costs 15 credits
  - 15 credits per successful production deploy (also listed as '15 credits each' on the pricing
    page calculator at https://www.netlify.com/pricing/)
  - Quote: "Each successful production deploy consumes 15 credits during that month's billing cycle"
  - Source:
    [How credits work | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
    (as of 2026-07)
- **[confirmed]** Pro's monthly credits buy roughly 200 production deploys
  - Exactly 200 production deploys/month if credits are spent on nothing else (3,000 credits ÷ 15
    credits/deploy). Bandwidth (20 credits/GB), compute (10 credits/GB-hour), and web requests (2
    credits/10k) draw from the same pool, so the real deploy budget is lower.
  - Quote: "Production deploys | 15 credits per production deploy"
  - Source:
    [Billing FAQ for Credit-based pricing plans | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)
    (as of 2026-07)
- **[confirmed]** An agent-driven repo doing ~50 commits/day burns the Pro allotment in under a week
  - 4 days, if every commit lands on the production branch and deploys successfully: 50 deploys/day
    x 15 credits = 750 credits/day; 3,000 credits last 4 days. Caveats: only successful production
    deploys count — failed deploys, rollbacks, and preview/branch deploys cost 0 credits, so commits
    routed through PRs/previews don't burn credits.
  - Quote: "Each successful production deploy consumes 15 credits during that month's billing cycle.
    Failed deploys and rolling back a production deploy to a previous production deploy does not
    consume credits."
  - Source:
    [How credits work | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
    (as of 2026-07)
- **[corrected]** Branch deploys and deploy previews cost credits
  - 0 credits — deploy previews and branch deploys are free on credit-based plans; only production
    deploys consume credits
  - Quote: "You have free deployments for previewing, experimenting, and creating versions of your
    site/app"
  - Source:
    [How credits work | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
    (as of 2026-07)
- **[confirmed]** Free tier allowance under the credit system
  - 300 credits/month = max 20 production deploys/month; hard limit with no option to buy extra
    credits; unlimited deploy previews. When credits run out, projects are paused until the next
    billing cycle.
  - Quote: "300 credits a month and unlimited deploy previews ... (docs: 'you cannot buy extra
    credits on the free Credit-based plans')"
  - Source:
    [Credit-based pricing on Netlify, built for today's AI development workflows | Netlify Blog](https://www.netlify.com/blog/new-pricing-credits/)
    (as of 2026-07)
- **[confirmed]** What happens when credits run out
  - All the team's web projects are paused and visitors see a 'Site not available' page (paid plans
    can enable auto-recharge: Personal 500 credits/$5, Pro 1,500 credits/$10 — implying
    ~$0.0067/credit, so a production deploy is ~$0.10 marginal)
  - Quote: "Once your monthly credit allotment is used up for all web projects on your team, all of
    your web projects (sites/apps) are paused and visitors to your web projects will find a
    `Site not available` page"
  - Source:
    [How credits work | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
    (as of 2026-07)
- **[confirmed]** When the credit system was introduced
  - September 4, 2025 — all new Netlify accounts start on credit-based plans from that date;
    existing customers could stay on legacy plans. Metered rates were then revised April 14, 2026
    (bandwidth 10→20 credits/GB, compute 5→10 credits/GB-hour, web requests 3→2 credits/10k, form
    submissions 1 credit→free, Pro 5,000 credits/member→3,000 credits flat with unlimited seats).
  - Quote: "Starting on September 4, 2025, all new Netlify accounts will use the new credit-based
    pricing plans."
  - Source:
    [Billing FAQ for Credit-based pricing plans | Netlify Docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)
    (as of 2026-07)

Notes: Operator's numbers all check out against the live pricing page
(https://www.netlify.com/pricing/ shows Pro
$20/3,000 credits and 'Production deploys: 15 credits
each') and Netlify docs. Two nuances for landing copy: (1) the 'under a week' burn assumes every
commit triggers a successful production deploy — preview/branch deploys, failed deploys, and
rollbacks are free, so the claim should say 'commits to production' or 'production deploys', not
just 'commits'; (2) the 3,000-credit Pro figure is current as of the April 14, 2026 repricing — at
the Sept 2025 launch Pro included 5,000 credits per member. Plans: Free $0/300
credits (hard cap, sites pause with 'Site not available' page), Personal
$9/1,000 credits, Pro $20/3,000 credits with unlimited seats. Other current rates sharing the credit
pool: bandwidth 20 credits/GB, compute 10 credits/GB-hour, web requests 2 credits/10k, forms free,
AI inference 180 credits per $1. Overage
credit price ~$0.0067 (Pro pack 1,500 for
$10), so one production deploy is about $0.10 marginal.

## Cloudflare And GitHub

- **[confirmed]** Cloudflare Workers paid plan costs $5/month
  - $5 USD/month minimum charge (Workers Paid plan; includes 10M requests/month, then usage-based)
  - Quote: "The Workers Paid plan includes Workers, Pages Functions, Workers KV, Hyperdrive, and
    Durable Objects usage for a minimum charge of $5 USD per month for an account."
  - Source:
    [Pricing · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/)
    (as of 2026-07)
- **[confirmed]** Workers Free tier includes a daily request allowance
  - 100,000 requests/day (10 ms CPU time per invocation)
  - Quote: "100,000 per day"
  - Source:
    [Pricing · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/)
    (as of 2026-07)
- **[confirmed]** Workers static asset requests are free on the free tier
  - Free and unlimited on both Free and Paid plans (request counts toward the daily limit only if it
    invokes the Worker)
  - Quote: "Requests to static assets are free and unlimited."
  - Source:
    [Pricing · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/)
    (as of 2026-07)
- **[confirmed]** Workers Builds (CI/CD) is included in the Workers free tier
  - Free plan: 3,000 build minutes/month, 1 concurrent build. Paid
    ($5) plan: 6,000 build
    minutes/month (then +$0.005/min), 6 concurrent builds
  - Quote: "Build minutes ... Free: 3,000 per month ... Paid: 6,000 per month (then, +$0.005 per
    minute); Concurrent builds ... Free: 1 ... Paid: 6"
  - Source:
    [Limits & pricing · Cloudflare Workers docs (Workers Builds)](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
    (as of 2026-07)
- **[confirmed]** Cloudflare Pages free tier is limited to 500 builds/month
  - 500 builds/month and 1 concurrent build on the Free plan
  - Quote: "Free: 1 build at a time, 500 builds per month"
  - Source:
    [Limits · Cloudflare Pages docs](https://developers.cloudflare.com/pages/platform/limits/) (as
    of 2026-07)
- **[confirmed]** Parallel/concurrent builds on Pages require the
  $20 Pro plan, while Workers gets
  concurrency on the $5 plan and branch preview deploys even on
  free
  - Pages Free = 1 concurrent build; 5 concurrent builds require Pro at
    $20/mo billed annually
    ($25/mo billed monthly). Workers Paid ($5/mo) includes 6 concurrent
    builds; Workers Builds branch preview builds/preview URLs work on the free plan (1 at a time,
    3,000 min/month)
  - Quote: "Pro: $20/mo billed annually ... 5 concurrent builds ... 5,000 builds per month; Free: 1
    build at a time ... 500 builds per month"
  - Source:
    [Cloudflare Pages (official pricing section); concurrency for Workers: developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/; branch previews: developers.cloudflare.com/workers/ci-cd/builds/build-branches/](https://pages.cloudflare.com/)
    (as of 2026-07)
- **[confirmed]** Cloudflare publicly recommends Workers over Pages for new projects
  - Official blog (2025-04-08): start new projects with Workers; all future investment goes to
    Workers, Pages remains supported
  - Quote: "Now that Workers supports both serving static assets and server-side rendering, you
    should start with Workers. Cloudflare Pages will continue to be supported, but, going forward,
    all of our investment, optimizations, and feature work will be dedicated to improving Workers."
  - Source:
    [Your frontend, backend, and database — now in one Cloudflare Worker (Cloudflare Blog, Apr 8 2025)](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)
    (as of 2025-04)
- **[confirmed]** Cloudflare shipped standard OAuth app support in June 2026
  - Self-managed OAuth clients launched June 3, 2026: any developer can register OAuth apps (Manage
    account > OAuth clients) with scoped access; apps start private and can go public after domain
    verification
  - Quote: "Introducing self-managed OAuth clients ... OAuth lets third-party applications act on
    behalf of a user to access their Cloudflare account."
  - Source:
    [Introducing self-managed OAuth clients · Cloudflare Changelog (see also blog.cloudflare.com/oauth-for-all/)](https://developers.cloudflare.com/changelog/post/2026-06-03-public-oauth-clients/)
    (as of 2026-06-03)
- **[confirmed]** GitHub free tier includes free private repositories
  - Unlimited private repositories on the Free plan
  - Quote: "Unlimited private repositories ... Private repositories are only accessible to you and
    people you share them with."
  - Source: [GitHub Pricing](https://github.com/pricing) (as of 2026-07)
- **[confirmed]** GitHub free tier includes GitHub Actions minutes
  - 2,000 Actions minutes/month for private repos on GitHub Free (plus 500 MB artifact storage);
    Actions is entirely free for public repositories on standard runners
  - Quote: "GitHub Free | 500 MB | 2,000 | ... GitHub Actions usage is free for self-hosted runners
    and for public repositories that use standard GitHub-hosted runners."
  - Source:
    [About billing for GitHub Actions - GitHub Docs (also github.com/pricing: '2,000 CI/CD minutes/month')](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
    (as of 2026-07)

Notes: All ten sub-claims verified against Cloudflare/GitHub primary sources; none corrected
outright, but two need precise landing-page wording. (1) Pages Pro price:
$20/mo is the
annually-billed price; month-to-month is $25/mo — say
"$20/mo (billed annually)" or just "Pro plan"
if space is tight. (2) Workers concurrency nuance: the Workers FREE plan also has only 1 concurrent
build (3,000 build-min/month); it is the $5
Workers Paid plan that includes 6 concurrent builds vs Pages needing $20 Pro for 5. Branch preview
deploys (non-production branch builds + preview URLs + PR comments) do work on Workers free — they
just queue serially. Pages-vs-Workers direction is an explicit official statement in the Apr 2025
Cloudflare blog post (quote included); Pages docs pages themselves phrase it more softly (migration
guide + 'broader set of features'), so cite the blog for the strong claim. OAuth: the June 3, 2026
changelog entry 'Introducing self-managed OAuth clients' plus the companion blog post
blog.cloudflare.com/oauth-for-all/ ('Unlocking the Cloudflare app ecosystem with OAuth for all') are
the receipts; apps start account-private and require domain verification to go public — relevant if
the landing page implies instant public OAuth listing.

## Convex

- **[confirmed]** Convex's free tier is called the Free/Starter plan and costs $0
  - "Free & Starter" plan: Free, or $0/month pay-as-you-go beyond included limits; supports 1-6
    developers
  - Quote: "Free & Starter ... For personal projects and prototypes ... Free ... or $0/month and pay
    as you go ... Developers (1-6)"
  - Source: [Convex — Choose Your Plan (pricing page)](https://www.convex.dev/pricing) (as of
    2026-07)
- **[confirmed]** Operator recall: '~40 deployments free'
  - Exactly 40 deployments per team on the Free/Starter plan (Pro: 300, Business/Enterprise:
    unlimited)
  - Quote: "Deployment limit — Maximum number of deployments per team: free "40", pro "300",
    enterprise "Unlimited""
  - Source:
    [Convex pricing page, Resources comparison table (same figures at docs.convex.dev/production/state/limits)](https://www.convex.dev/pricing)
    (as of 2026-07)
- **[confirmed]** Each project gets one prod deployment plus a dev deployment per developer
  - 1 shared prod deployment per project + 1 dev deployment per developer per project (preview
    deployments also available on all plans)
  - Quote: "By default, each project has a single shared prod deployment and each developer working
    on the project has their own dev deployment."
  - Source:
    [Convex Docs — Working with Multiple Deployments](https://docs.convex.dev/production/multiple-deployments)
    (as of 2026-07)
- **[unverifiable]** Number of projects included in the free plan
  - No project-count cap is published on the current pricing page, pricing FAQ, or docs limits page;
    the team-level cap is expressed only as 40 deployments (a project consumes 1 prod + 1 dev
    deployment per developer, so ~20 single-dev projects fit in practice — but do not state a
    project number as official)
  - Quote: "Limits are applied per team unless stated otherwise. ... Deployments: 40 [Free/Starter]"
  - Source: [Convex Docs — Limits](https://docs.convex.dev/production/state/limits) (as of 2026-07)
- **[confirmed]** Free tier function calls per month
  - 1,000,000 function calls/month (Free: hard cap; Starter: $2.20 per additional 1M)
  - Quote: "Function calls — Free: 1,000,000/month total; Starter: 1,000,000/month included; $2.20
    per additional 1,000,000"
  - Source:
    [Convex Docs — Limits (matches pricing page: "1M included ($2.20 per additional 1M)")](https://docs.convex.dev/production/state/limits)
    (as of 2026-07)
- **[confirmed]** Free tier database storage
  - 0.5 GB database storage (Free: total cap; Starter: $0.22/month per additional GB); plus 1 GB
    file storage
  - Quote: "Storage — Free: 0.5 GB total; Starter: 0.5 GB included; $0.22/month per additional GB"
  - Source:
    [Convex Docs — Limits, Database section](https://docs.convex.dev/production/state/limits) (as of
    2026-07)
- **[confirmed]** Free tier database bandwidth
  - 1 GB/month database bandwidth (Free: total cap; Starter: overage billed)
  - Quote: "Free: 1 GB/month total; Starter: 1 GB/month included"
  - Source:
    [Convex Docs — Limits, Database bandwidth row (pricing page shows "1 GB included ($0.22 per additional GB)")](https://docs.convex.dev/production/state/limits)
    (as of 2026-07)
- **[confirmed]** Convex Pro plan price
  - Professional plan:
    $25 per developer/month (includes 25M function calls/mo, 50 GB DB storage, 50
    GB/mo egress; developers 1-20). Business & Enterprise starts at $2,500
    monthly minimum
  - Quote: "Professional ... For startups moving from prototype to production ... $25 per
    developer/month"
  - Source: [Convex — Choose Your Plan (pricing page)](https://www.convex.dev/pricing) (as of
    2026-07)
- **[confirmed]** Convex has an official statement that the database is not directly accessible to
  clients — functions are the only public surface
  - Official Convex statement: the database is only accessible via server functions, never exposed
    directly to end-users
  - Quote: "RLS is necessary on platforms that expose your database directly to end-users, but your
    Convex database is only accessible via server functions where you can apply authorization checks
    directly."
  - Source:
    [Convex Stack (official Convex blog) — Row Level Security](https://stack.convex.dev/row-level-security)
    (as of 2026-07)
- **[confirmed]** Convex docs state clients read/write only through functions (supporting statement)
  - Docs: all reads/writes go through query/mutation functions; every public request is checked in
    code, unlike client-oriented databases
  - Quote: "You read and write to your database through query or mutation functions.
    (docs.convex.dev/understanding). Also: "This architecture lets you check every public request
    against any authorization rules you can define in code. This means Convex doesn't need an
    opinionated authorization framework like RLS, which is required in client oriented databases
    like Firebase or Supabase." (docs.convex.dev/auth)"
  - Source:
    [Convex Docs — Convex Overview (and docs.convex.dev/auth, Authorization section)](https://docs.convex.dev/understanding/)
    (as of 2026-07)
- **[unverifiable]** Convex Chef itself publishes a security-model statement
  - No explicit security-model statement found on chef.convex.dev (client-rendered SPA with no
    static copy) or the Chef announcement post; the official 'functions-only database access'
    statements live on stack.convex.dev and docs.convex.dev instead — attribute the claim to Convex,
    not Chef
  - Quote: "Chef by Convex | Generate realtime full-stack apps (page title; no security copy in
    served HTML)"
  - Source: [Chef by Convex](https://chef.convex.dev/) (as of 2026-07)

Notes: Operator's "~40 deployments free" is exact: the Free/Starter plan caps a team at 40
deployments (pricing-page tooltip: "Maximum number of deployments per team"; same table at
https://docs.convex.dev/production/state/limits). There is no separately published project cap on
current pages — a landing claim should say "40 deployments free" rather than a project count. Free
tier also includes 20 GB-hours/mo action compute, preview deployments, auth, text/vector search,
crons (pricing page). Free vs Starter: identical included amounts; Free hard-caps (deployment may
return HTTP errors when over limits per the pricing FAQ), Starter bills overages. For the security
claim, the strongest verbatim official line is on Convex's Stack blog (row-level-security article):
"your Convex database is only accessible via server functions" — cite that plus
docs.convex.dev/understanding/, not Chef, whose site has no static security copy.

## Config-Database Breach Incidents

- **[confirmed]** 2024 Firebase mass-misconfiguration research: researchers logykk, mrbruh, and
  xyzeva scanned the web and found ~900 sites exposing ~125M user records, including plaintext
  passwords, via misconfigured Firebase
  - 916 misconfigured sites exposing 124,605,664 user records: 84.2M names, 106.3M emails, 33.6M
    phone numbers, ~20M passwords (19-20M in plaintext), 27.5M billing-info entries; found by
    scanning ~5.2M domains; only 24% of the 842 notified site owners fixed it
  - Quote: "900 Sites, 125 million accounts, 1 vulnerability"
  - Source:
    [env.fail: 900 Sites, 125 million accounts, 1 vulnerability (researchers' own writeup); corroborated by The Register, https://www.theregister.com/2024/03/18/google_firebase_cloud_security/ and BleepingComputer, https://www.bleepingcomputer.com/news/security/misconfigured-firebase-instances-leaked-19-million-plaintext-passwords/](https://env.fail/posts/firewreck-1/)
    (as of 2024-03)
- **[confirmed]** Chattr.ai incident: the same researchers gained full admin read/write on the
  Firebase backing Chattr, an AI hiring system used by US fast-food chains (KFC, Subway, Taco Bell,
  Wendy's, Applebee's, Chick-fil-A), by simply registering a new user
  - January 2024 (writeup published ~Jan 9-10, 2024): Firebase registration misconfiguration granted
    admin privileges, exposing names, phone numbers, emails, plaintext passwords, and confidential
    messages of employees, managers, and job applicants
  - Quote: "How I pwned half of America's fast food chains, simultaneously"
  - Source:
    [MrBruh's Epic Blog: How I pwned half of America's fast food chains, simultaneously; corroborated by SecurityWeek, https://www.securityweek.com/misconfigured-firebase-instances-expose-125-million-user-records/](https://mrbruh.com/chattr/)
    (as of 2024-01)
- **[confirmed]** 2025 Lovable missing-RLS vulnerability (CVE-2025-48757): who reported it and what
  it exposed
  - Reported by Matt Palmer (a Replit employee, publishing personally, with colleague Luis Chavez
    credited in references) — discovered Mar 20 2025, disclosed to Lovable Mar 21 2025, CVE
    published May 29 2025, CVSS 3.1 9.3 Critical; a scan of 1,645 Lovable showcase apps found 170
    sites (303 Supabase endpoints) with missing/broken RLS exposing names, phone numbers, API keys,
    and payment details; Lovable formally disputes the CVE (says customers own data protection) but
    shipped an RLS 'security scan' feature in Lovable 2.0 on Apr 24 2025
  - Quote: "insufficient database Row-Level Security policy"
  - Source:
    [NVD: CVE-2025-48757; researcher writeup: https://mattpalmer.io/posts/CVE-2025-48757/; scan detail: https://www.superblocks.com/blog/lovable-vulnerabilities](https://nvd.nist.gov/vuln/detail/CVE-2025-48757)
    (as of 2025-05)
- **[corrected]** The 'VibeScamming' report is the same thing as the Lovable RLS exposure
  - Distinct incident, do not conflate: VibeScamming is an April 2025 Guardio Labs benchmark showing
    Lovable (score 1.8/10) would generate and host live phishing pages with credential-harvesting
    backends and admin dashboards on request — it is about scam generation resistance, NOT about
    unprotected Supabase tables; the RLS exposure is CVE-2025-48757 by Matt Palmer (separate item
    above)
  - Quote: "Lovable AI Found Most Vulnerable to VibeScamming — Enabling Anyone to Build Live Scam
    Pages"
  - Source:
    [Guardio Labs: VibeScamming — From Prompt to Phish; coverage: The Hacker News, https://thehackernews.com/2025/04/lovable-ai-found-most-vulnerable-to.html](https://guard.io/labs/vibescamming-from-prompt-to-phish-benchmarking-popular-ai-agents-resistance-to-the-dark-side)
    (as of 2025-04)
- **[confirmed]** Earlier Firebase mass-exposure research exists (2018 Appthority 'HospitalGown'
  report)
  - June 2018: Appthority found 2,200+ unsecured Firebase databases behind 3,000+ iOS/Android apps
    (620M+ Android downloads) exposing 100M+ records / 113 GB, including plaintext passwords, PHI,
    GPS data, and financial transactions — root cause was developers not enabling authentication on
    Firebase databases
  - Quote: "3,000+ mobile apps leaking data from unsecured Firebase databases"
  - Source:
    [Help Net Security: 3,000+ mobile apps leaking data from unsecured Firebase databases (Jun 20, 2018); also BleepingComputer, https://www.bleepingcomputer.com/news/security/thousands-of-apps-leak-sensitive-data-via-misconfigured-firebase-backends/](https://www.helpnetsecurity.com/2018/06/20/unsecured-firebase-databases/)
    (as of 2018-06)
- **[confirmed]** Additional documented Firebase misconfiguration study (Comparitech 2020/2021)
  - May 2020 (published May 12-13, 2020, not 2021): Comparitech team led by Bob Diachenko analyzed
    515,735 Android apps; of 155,066 using Firebase, 4,282 apps (4.8%) leaked sensitive data — apps
    with 4.22 billion combined installs — exposing 18.3M names, 7M emails, 1M passwords, 5.3M phone
    numbers, plus credit card numbers and government-ID photos; 9,014 apps even allowed public write
    access
  - Quote: "Given the average smartphone user has between 60 and 90 apps installed, the chances are
    high that an Android user's privacy has been compromised by at least one app."
  - Source:
    [Bitdefender Hot for Security: Researchers spot 24,000 Android Apps Leaking User Data (May 13, 2020, covering Comparitech/Diachenko research)](https://www.bitdefender.com/en-us/blog/hotforsecurity/researchers-spot-24000-android-apps-leaking-user-data)
    (as of 2020-05)
- **[confirmed]** Arc browser CVE-2024-45489: misconfigured Firebase access controls enabled remote
  code execution in other users' browsers
  - Aug-Sep 2024: misconfigured Firebase ACLs let anyone rewrite the creatorID of an Arc 'Boost',
    assigning attacker JavaScript to any victim's browser session (CVSS 9.8); discovered Aug 25
    2024, patched Aug 26, publicly disclosed with an official incident report by The Browser Company
    in September 2024, which also said it would move away from Firebase
  - Quote: "CVE-2024-45489 Incident Report"
  - Source:
    [Arc (The Browser Company): CVE-2024-45489 Incident Report; coverage: BleepingComputer, https://www.bleepingcomputer.com/news/security/arc-browser-launches-bug-bounty-program-after-fixing-rce-bug/](https://arc.net/blog/CVE-2024-45489-incident-response)
    (as of 2024-09)
- **[confirmed]** Tea app breach (July 2025) was caused by an unsecured Firebase storage bucket
  - July 25, 2025: the women's dating-safety app Tea had a legacy Firebase storage bucket accessible
    with no authentication (URL found in its Android app, posted on 4chan), exposing 72,000 images
    including ~13,000 selfies and photo IDs; a second exposure reported July 28, 2025 leaked 1.1M
    private messages; the company confirmed unauthorized access (originally reported by 404 Media)
  - Quote: "Tea app suffers breach, exposing thousands of user images"
  - Source:
    [Engadget: Tea app suffers breach, exposing thousands of user images (Jul 25, 2025, citing 404 Media)](https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html)
    (as of 2025-07)
- **[confirmed]** There are further documented Lovable/Supabase access-control failures beyond
  CVE-2025-48757
  - April 2026: a researcher reported a broken object-level authorization flaw to Lovable's bug
    bounty on Mar 3, 2026 that stayed exploitable on existing projects (created before Nov 2025) for
    48 days, exposing user records (names, job titles, LinkedIn profiles, Stripe customer IDs) and
    hardcoded Supabase credentials; Lovable first called the exposure 'intentional behaviour' before
    partially apologizing
  - Quote: "Lovable security crisis: 48 days of exposed projects, closed bug reports, & the
    structural failure of vibe coding security"
  - Source:
    [The Next Web: Lovable security crisis: 48 days of exposed projects (Apr 21, 2026)](https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed)
    (as of 2026-04)
- **[confirmed]** YouTube video https://www.youtube.com/watch?v=h6ffyfabfa8 titled 'STOP Building
  Apps With Supabase (Use THIS Instead)' exists
  - Exists: channel 'Robin Ebers' (https://www.youtube.com/@robinebers), uploaded January 7, 2026,
    ~46,551 views as of July 2, 2026 (verified via YouTube oEmbed API and the watch page's embedded
    metadata)
  - Quote: ""uploadDate":"2026-01-07T04:25:18-08:00" ... "ownerChannelName":"Robin Ebers""
  - Source:
    [YouTube: STOP Building Apps With Supabase (Use THIS Instead) — Robin Ebers](https://www.youtube.com/watch?v=h6ffyfabfa8)
    (as of 2026-01)

Notes: All items verified against primary or reputable secondary sources; nothing had to be dropped
as unverifiable. Footnote-safe phrasing guidance: (1) For the 2024 Firebase research say "~900 sites
/ ~125M user records" — the researchers' exact figures are 916 sites and 124.6M records;
plaintext-password counts vary between 19M (BleepingComputer headline) and 20.2M (env.fail), so
"~20M passwords, mostly plaintext" is defensible. (2) Attribute CVE-2025-48757 to "security
researcher Matt Palmer", not "Replit" — he works at Replit (a Lovable competitor), which a skeptical
reader may flag, and Lovable formally disputes the CVE while having shipped an RLS security-scan
feature in response; safest phrasing is "CVE-2025-48757 (disputed by vendor): 170 of 1,645 scanned
Lovable apps had missing/broken Supabase RLS". (3) Do NOT cite "VibeScamming" as a data-exposure
incident — it is a Guardio Labs benchmark about Lovable generating phishing pages; keep it separate
or omit it from a data-breach footnote. (4) The Tea breach was an unauthenticated Firebase _storage
bucket_, not Firestore security rules — still a Firebase config-based access-control failure, but
phrase it as "exposed Firebase storage" to stay precise. (5) The Comparitech study is May 2020
(headlines saying '24,000 apps' overstate; the body figure is 4,282 leaking apps out of 155,066
Firebase apps, 4.22B installs). The YouTube video is real: Robin Ebers, Jan 7 2026, ~46.5K views.

## Toolchain Facts (added 2026-07-02, second sweep)

- **[confirmed]** Cloudflare acquired VoidZero (Evan You's company behind Vite, Vitest, Rolldown,
  Oxc, Vite+), announced June 4, 2026; a true acquisition, terms undisclosed; all tools stay
  MIT-licensed; Cloudflare committed $1M to an independent Vite ecosystem fund.
  - Source:
    [Cloudflare press release](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-voidzero-to-build-the-future-of-the-ai-native-web/)
    and [Evan You, "VoidZero is Joining Cloudflare"](https://voidzero.dev/posts/voidzero-cloudflare)
    (2026-06-04).
- **[confirmed]** Vite+ (`vp`) bundles Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, and Vite Task
  behind one CLI; announced as alpha March 13, 2026; MIT-licensed. Node is the only JS runtime (vp
  itself is a native binary that manages Node); official installers for macOS/Linux/Windows.
  - Source: [voidzero-dev/vite-plus README](https://github.com/voidzero-dev/vite-plus) and
    [viteplus.dev guide](https://viteplus.dev/guide) (2026-07-02).
- **[corrected]** TanStack Start is a v1 Release Candidate, not stable v1 (RC announced 2025-09-23;
  docs still say RC as of 2026-06-01). React-first with Solid 2.0 beta support; Router/Query cores
  are framework-agnostic.
  - Source:
    [TanStack Start overview docs](https://tanstack.com/start/latest/docs/framework/react/overview)
    and [v1 RC announcement](https://tanstack.com/blog/announcing-tanstack-start-v1) (2026-07-02).
