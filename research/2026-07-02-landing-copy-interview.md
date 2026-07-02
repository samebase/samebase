# Landing Copy Interview — Operator Answers

## Status

- Status: research / source material for landing copy. Not product copy itself.
- Date: 2026-07-02.
- Companion to `research/2026-06-28-landing-positioning-ideas.md` (idea parking lot) — this file
  holds the operator's answers to a structured copy interview. Wording is distilled from a voice
  interview; kept close to the operator's phrasing, lightly cleaned.
- Related PR: https://github.com/samebase/samebase/pull/1112

## The Inversion Thesis (core positioning)

Pre-LLM app builders split people into two groups: developers who build the platform's building
blocks, and users who wire building blocks together inside a configuration (Bubble et al.).
Chat-first builders (Lovable et al.) repeat the pattern from the other side: they start maximally
easy, then have to painfully wrap real engineering workflows as their users grow — expanding a chat
box into a full engineering surface is the hard direction.

Samebase inverts this: start from the real engineering workflows the operator actually uses, then
simplify them until almost anyone with an LLM tool (Codex, Claude Code) can run them. The LLM is the
equalizer — the visitor is already capable of building. What they lack is the base decisions:
mainstream advice says Postgres/Supabase/Docker, which a working engineer managing many small apps
would not choose, because that complexity multiplies per app.

Complexity is minimized from the start; the point where complexity returns is pushed far into the
future. "You would still have complexity at some point, but you push that point far away."

## What Samebase Actually Is (two things, not one)

1. An auto-provisioned template. Many templates come with long setup instructions; here you press a
   button and get a provisioned app in about a minute (Workers builds take seconds).
2. A central space for all your apps: list of apps, branches, pull requests, monitoring. Works best
   with the Convex + Cloudflare focus, but any GitHub repo can be connected. Provision-or-connect is
   symmetric: connect an existing repo, connect an existing worker, or provision either from inside
   Samebase.

Monorepo support exists because samebase itself is a monorepo — multiple apps per repo connect in
the UI.

The product deliberately does NOT include an in-app AI agent. There was a chatbot; it is hidden —
expensive and unnecessary. "The app doesn't act like a wrapper around any AI tool. It acts like a
tool that you can use inside your AI tool." There is an MCP server exposing two tools so far: create
app, list apps — an agent can create Samebase apps from inside Codex/Claude Code.

Why no in-app agent: no VC money to subsidize "a chat input that kind of works", and engineers
already own better tools. Forcing users into in-app AI means forcing them to abandon tools they
already pay for and pay more for a worse one. Bring-your-own is both the transparency story and the
cost story.

(History: the product started as "Obsidian that auto-commits to GitHub"; that still works, but
editing compute is expensive, so app creation became the focus. The branch editor exists and the
operator uses it, but it is not optimized enough to give away at scale.)

## The Provider Path (war stories, with numbers)

Actual migration path of the operator's own apps: Vercel → Netlify → Cloudflare Pages → Cloudflare
Workers. (Repo copy rule: landing copy never names Vercel; "I moved my apps three times" is fine.)

- Netlify: pricing killed it. ~$20/month buys ~3,000 credits; a production deploy costs 15 credits ≈
  200 deploys/month. An agent-driven repo doing ~50 commits/day burns that in under a week. "There
  are options to optimize it, but I don't have time to optimize this bullshit." Critically: Samebase
  already had Netlify provisioning built and working, and the operator uprooted it — "if I know
  something is better, why would I sell anything else to my users."
- Cloudflare Pages → Workers (recent, ~May 2026, around the TanStack Router move): Pages' free tier
  is generous (500 production deploys/month), but parallel/branch deploys on Pages require the $20
  Pro zone, while Workers' paid plan is $5. Cloudflare is visibly pushing everyone from Pages to
  Workers — "when you rely on these big companies you must read the direction they're going." With
  static assets, Workers is roughly as cheap as Pages.
- Cloudflare OAuth: originally a blocker (users must never copy API keys around). Cloudflare shipped
  standard OAuth apps in June 2026; before that the MCP OAuth support was the workaround.
- Fewest providers possible: every extra provider multiplies complexity (the operator has debated
  WorkOS/Clerk for months and keeps not adding them). Cloudflare is Amazon-class: object storage,
  protection, scale — when the app grows, the provider is already right.
- Annoying real-world hurdle worth acknowledging: the Cloudflare GitHub app must be installed for
  the pipeline to work; account creation + three OAuths is the biggest onboarding hurdle. This is
  why Do It Yourself exists — it proves there is no magic and doubles as a debugging manual.

## The Convex Security Argument (3 boxes, 2 connections)

The drawing the operator uses with engineer friends: a simple web app is three components —
database, server, frontend — but people only see the boxes. The two CONNECTIONS (db↔server,
server↔frontend) carry most of the security and complexity budget: Drizzle or Prisma? tRPC or
hand-rolled Express? Years of battling those questions.

Firebase (used personally; Supabase judged to be the same shape): the frontend queries the database
directly, and the missing backend is patched with a bespoke rules/config language that looks like
JavaScript but isn't. Instead of writing standard backend TypeScript you learn a whole new paradigm
just to gate queries. This pattern caused real breaches — Lovable and other Supabase-reliant
products had publicized security incidents; misconfigured rules are the standard failure.

Convex: it is just a backend. Queries/mutations/actions are endpoints in standard TypeScript; the
client can only reach what a function exposes. Database + backend + BOTH connections live in one
place, with React hooks included. Far fewer moving parts; access control is code you already know
how to write. "You fall by default into the valley of success — it's hard to mess up so bad."
Operator's maximal private version: "at this point, if you're not using Convex, your app is a
security risk." (Public phrasing strength: decided separately.)

The operator has been recommending Convex to engineering friends for years; Samebase is partly the
proof: "it's so good that THIS is how you can just do it."

## Competitors

Convex-based Lovable clones exist and are tracked (weekly automation): https://vly.ai/ ,
https://converge.run/ , https://cto.new/ . Vly names its competitors (Supabase etc.) on its own
landing page.

Samebase sits at the Lovable level of the market but is deliberately more niche: it does not hide
the platform, does not run sandboxes (Daytona was tried and dropped — "if I don't personally use it,
I can't expect a different engineer to use it"; the operator's own computer is cheaper and more
powerful), and does not resell AI. Candidate slogan the operator has used: "Lovable for devs" —
unsure whether naming another company that way is appropriate.

Naming Supabase/Firebase/Netlify on the landing = fighting Convex's and Cloudflare's battles;
ambivalent about doing that on the landing itself.

## Same Base, Literally

samebase.com runs on its own Convex deployment and Cloudflare Workers. The repo is private for now
(fear of being snatched pre-community); it and the template are expected to go public at release.
Some of the operator's older apps still sit on Netlify + Convex; migrating them is intentionally
saved as video material ("watch me move a real app onto the stack").

## The Leaving Test

Create an account → connect providers → create an app → delete the Samebase account → the app keeps
running. You can disconnect and reconnect a repo later. "Samebase can die tomorrow and you will
still have your app running." The Do It Yourself article exists so you don't even need the account.
This is the anti-app-builder property: no forced staying.

## Costs And Pricing Honesty

- The user's compute belongs to the user's providers: Convex is the real backend (good free tier),
  Workers $5/month tier (free tier viable for casual apps), GitHub free for years.
- Samebase's own cost per user is small — app creation is cheap. The genuinely costly parts:
  refreshing repos with hundreds of branches, and the (unoptimized) branch editor.
- No pricing model yet. Plan: give it to friends, watch usage. A future paid shape might be
  provisioning apps under Samebase-owned accounts wrapped for the user — which is exactly why "you
  own everything" is the honest default today.

## Worktrees / Lanes (translation guidance)

For non-engineers: "run as many agents in parallel as you want; they won't overwrite each other's
work." For engineers: this is genuinely hard to set up (friends confirmed); Codex and Claude Code
both have worktree support baked in, so a stack where every worktree gets its own database and
preview deploy unlocks what those tools already want to do. The operator spent the first 2–3 weeks
of the project making worktrees work because it unlocks the most potential. Keep it on the landing;
translate it.

## Template Philosophy

Every decision in the template is the smallest necessary one. No SaaS bells and whistles — the test:
"what if you just want to make a tic-tac-toe game while drinking with your friends?" The template
stays small on purpose; important stuff only.

## Proof Plans

- Record the full provisioning flow for YouTube; embed on the landing.
- DIY page videos were deliberately shot on a phone: "even without a computer you can build an app."
- Migrate the operator's remaining Netlify apps on camera as sample material.

## Numbers To Verify Before Publishing

- Netlify: ~3,000 credits at $20/month, 15 credits per production deploy (operator's recollection).
- Cloudflare: Pages free tier 500 deploys/month; Workers paid $5; Pages parallel deploys needing $20
  Pro.
- Convex free tier shape ("~40 deployments free" per operator recollection).
- Provisioning time ("about a minute").

## Open Copy Decisions (for the rewrite)

- Audience register resolution (operator explicitly blocked on this; wants help deciding).
- How directly to name competitors on the landing vs. linked articles.
- Public strength of the Convex security claim.
- Whether dated concrete pricing numbers go on the page.
- Whether the MCP create-app tool is landing-page material yet.
