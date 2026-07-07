# Stack Decision Rationale — Operator Interview

Voice-interview capture (2026-07-06, cleaned from voice-to-text), same genre as
`research/2026-07-02-landing-copy-interview.md`. The operator's rationale for the stack decisions,
recorded so it stops living only in chat. This is the raw material for a future `/docs/decisions`
corpus page (rfcs/093 Phase 1 follow-up): receipts stay verifiable facts; decisions carry the
rationale, the events that validated them, and how hard each is to revert.

A repo-status caveat from the accompanying spec trace: `rfcs/` headers stay "Proposed" forever even
after the work ships (per `rfcs/README.md`'s extract-don't-edit model), so decision records must
state today's truth with code and `specs/` as evidence, not rfc headers.

## The decision tiers

The operator distinguishes three tiers, and the future decisions page should label every entry:

1. **Baked in** — GitHub, Convex, Cloudflare Workers. Integration is built around these; GitLab has
   no integration path. Partial adoption exists (a repo without Convex/Cloudflare can still be
   watched through GitHub), but the trio is the product's foundation.
2. **Template defaults, replaceable** — TanStack Start, React, Tailwind, shadcn/ui. Deliberate
   policy: "if a decision is good and it's easy to revert, it belongs in the stack." The deploy
   pipeline serves whatever is built — a plain `index.html` + `index.js` with no build step ships
   the same way.
3. **Open** — auth is the one the operator still actively struggles with.

## Cloudflare: not just the cheapest

Cost is one input among several; the receipts page currently over-indexes on it.

- **You would use Cloudflare anyway.** "Even if you rely on other hosting platforms, you'd still use
  Cloudflare for their protection." Choosing it as the host removes a provider instead of adding
  one.
- **OAuth-connectability was a hard requirement**, because of the phone. The rejected flow: go to
  the Cloudflare dashboard, create an API key, figure out which access policies it needs, copy it
  back — "that's a lot of work," and hostile on mobile. OAuth connect makes the entire app usable
  from a phone.
- **History and validation**: Cloudflare had no public OAuth when the integration was built, so
  Samebase used Cloudflare's MCP OAuth as the workaround
  (`rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`,
  `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`,
  `rfcs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`). In June 2026 Cloudflare shipped
  self-managed public OAuth clients (receipt already gathered: changelog 2026-06-03) — the operator
  reads that as the bet validating itself. Samebase adopted the standard flow days later (v1554,
  2026-06-22) as the primary connection path; the legacy MCP OAuth flow remains mounted pending
  removal (see the verified answers below).
- **Room to grow without new accounts.** Cloudflare is AWS/GCP-like in product breadth. The stack is
  deliberately as small as possible, so users are expected to outgrow it — and when they do, they
  should not face a new "AWS or Google?" decision, because the account they already connected
  carries most of what they'll need. Fewest-providers was an explicit optimization from the start
  (`rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md` is the earliest trace; outcome superseded
  by `rfcs/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md` and
  `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`).
- The big open adjacent question at selection time: hosting was the hard one because it bundles
  protection and domain management, not just serving.

## Convex: the bet

"The newest and the one that sounds more risky and the one that is the bet I'm betting on." Not a
momentary call — the operator watched Convex for multiple years before committing: "there's nothing
better than Convex." The security-architecture argument (database only reachable through server
functions) is receipted; the bet framing itself belongs on the decisions page, stated as a bet. No
repo doc records the original adoption decision (spec trace: treated as a given everywhere).

## GitHub: the standard

"Kind of the standard way to host your code." Baked in; GitLab explicitly unsupported. A vault
without Convex/Cloudflare can still be watched through GitHub — partial adoption is real but
undocumented as an audience.

## Template decisions

- **TypeScript for everything, including scripts.** Shell scripts break Windows; all-TypeScript
  scripts running through Vite+ mean Samebase starts on a Windows machine "pretty easily."
  Documented: `rfcs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md` (lived practice).
- **Vite+ (`vp`).** One tool for dev server, tests, lint, format, bundling. Prior consolidation
  attempts (Biome and others) "didn't really catch up"; Vite+ the operator adopted fast and just
  uses. Validation event: Cloudflare acquired VoidZero (June 2026) — "all the decisions that we're
  making are good decisions." The operator's own gloss: "it's very important to always have a look
  and feel about what's happening in the landscape. That's harder to put in receipts, but that's
  usually the more important thing." No repo doc records the adoption (spec trace: package.json
  only) — this interview is the first written rationale.
- **TanStack Start / Router.** History: the repo started as a basic React app; Next.js was rejected
  as cumbersome and "not a good direction." Months later, after researching, "once I viewed the
  video about what TanStack Router and TanStack Start are, it was pretty clear that using anything
  else is a bad decision. I wouldn't be able to go so deep and do such complex things with my app if
  I would have chosen a different stack." Documented downstream: `specs/080–083` (accepted migration
  specs) and `research/2026-04-08-root-route-framework-discussion-summary.md`.
- **React, with Solid watched.** React is the safe bet. Solid.js + TanStack Start is the credible
  challenger (TanStack ships Solid support), but Solid is mid-v2 — not adopted yet; possibly future
  subapps. The strip-down invariant holds regardless: the stack works with a bare `index.html`.
- **Tailwind + shadcn/ui.** Tailwind "doesn't really have competition right now." shadcn is good and
  replaceable — explicitly not a lock-in decision.
- **Radix vs Base UI — the methodology example.** When shadcn asked Radix-or-Base-UI, the operator
  delegated a research thread (Codex) into the teams' history and direction, and learned the team
  that built Radix now works on Base UI — so Base UI is the correct pick. This is the "vibes" method
  made explicit: landscape monitoring (following the people who build the tools) plus
  agent-delegated background research, converging on a defensible call. No repo doc mentions Base UI
  at all (spec trace) — capture-worthy on its own. Where it actually landed is inverted from the
  operator's memory: samebase.com runs Base UI, the starter template still runs Radix (see the
  verified answers below).

## Auth: the open decision

The most annoying bit, and still open. The tension: samebase.com is an app expecting ~a thousand
users; a personal app built from the template has different needs — and the operator wants to use
the same thing on samebase.com that he recommends to others (the built-in-itself principle). Current
call for the template: ship Convex Auth with the basic JWT key setup — the most basic working
authentication — and let the user's agent (Codex, Claude) extend it with email or other logins on
request. No repo doc records the auth-provider decision (spec trace); the 2026-07-06 session
separately decided samebase.com itself stays on Convex Auth + its own OAuth server rather than
adopting WorkOS (see the auth.md discussion in the rfcs/093 session).

## Things around the stack

The operator considers these as important as the stack itself; some migrated to the template, some
not yet:

- **Worktree dev environments**: `dev` inside a git worktree starts a local anonymous Convex
  database; in the main checkout it uses the cloud dev deployment. "A very important thing."
  Documented behavior (`docs/agent-workflows.md`), underlying rfcs 013/015/019 never promoted.
- Mini-scripts accumulated in Samebase, partially translated to the template — the migration state
  itself is worth tracking on the decisions page.

## The use-case philosophy

People imagine apps with 1,000–10,000 users; the operator designs for the other reality: "you should
be able to build several apps just for yourself, just because you need something done" — a game with
friends, no metrics, no analytics, no Clerk/WorkOS ceremony. "Even if you strip everything down to
the lowest variable, our stack is still good enough, because I don't want to guess what you want to
do — you can have a discussion with Codex or Claude and figure it out yourself." Workers + Convex
are "good for like 99% of ideas." The recurring cost story: "usually you have an idea and then
you're stuck paying $20 a month just to keep it hosted — maybe you have three small ideas you forgot
for several years, and they still should work."

## Proposed shape for the decisions page (corpus follow-up)

One record per decision: **context → decision → validating events (dated) → tier (baked-in /
replaceable default / open) → revert condition**. Receipts stay facts-only and are cross-linked
where a decision leans on one (e.g., the June 2026 Cloudflare OAuth changelog receipt moves from
"excluded" to load-bearing under the Cloudflare decision). First records to write:
Cloudflare-beyond-cost, TypeScript-everywhere, Vite+, TanStack Start, Base UI, and Convex-as-bet.

## Answers, verified (2026-07-06)

The operator answered the six open questions the same day; each answer was then checked against
code, git history, the template repo, and primary sources rather than taken on faith.

1. **Cloudflare OAuth migration** — "already done." Half true: the standard public-OAuth-client flow
   shipped as v1554 (PR #1061, 2026-06-22, `apps/samebase/convex/cloudflareOAuth.ts:18-19`) and is
   the primary path for infra reads and provisioning (`infraRead.ts`, `infraProvisioning.ts`); the
   legacy MCP OAuth flow is still mounted alongside it (`apps/samebase/convex/http.ts:3-4`). Removal
   flagged as a follow-up task.
2. **The protection argument / provider UIs** — direction set: rather than reproduce provider
   consoles, Samebase links out to them — "we don't expect you to stay in our golden cage." Pattern
   verified: dashboard URL builders at `apps/samebase/convex/vault/dashboard.ts:482,502`, outbound
   links in the resource rail (`vaultResourceRailState.ts:442`) and deployment rows
   (`VaultDashboard.tsx:2865`).
3. **Convex revert condition** — the bet became safe when Convex released the backend
   source-available: "even if something dramatically changes, you can still self-host." Deeper:
   "even if I'd use something else, in the end I'd just reimplement the Convex DX" — the bet is on
   the DX shape, not the vendor. Now receipted with precision on the receipts page
   (FSL-1.1-Apache-2.0, each release converting to Apache 2.0 after two years; self-hosting covers
   backend, dashboard, and CLI; announced 2024-03-12).
4. **Partial adoption** — document it: "otherwise it might seem that we are interested only in
   people that use ONLY our stack, when in reality we're a tool that can be used in multiple
   different ways." Verified origin: the repo seeded 2025-07-18 from a stock `npm create convex`
   starter (a basic chat app), grew GitHub-repo editing immediately after — matching the stated
   original intent of editing a GitHub-backed Obsidian repo from a phone — and was renamed "Noter" →
   "noter.md" on 2026-05-01 (`03cc7f7d7`), then `noter-monorepo` → `samebase-monorepo` on 2026-06-20
   (`b6568204d`). Editing GitHub-backed text remains a supported way to use the product.
5. **Template auth** — "for now Convex Auth is good enough; when we get more adoption we can see
   what people need." That is the position, not yet the shipped state: the `samebase/app` template
   today is an unauthenticated todos app — no `@convex-dev/auth` dependency, no `auth.config.ts`
   (only bundled agent-skill reference docs mention auth). Gap to close before the corpus claims an
   auth baseline.
6. **Base UI** — "switched pretty early on." True for samebase.com, inverted for the template:
   `apps/samebase` runs Base UI (`@base-ui/react`, no Radix dependency), while `samebase/app` is on
   Radix (`radix-ui ^1.4.3`, style `radix-nova`) from its single shadcn-init commit (2026-04-19)
   with no migration since. AGENTS.md's architecture line said "Radix UI" for the app — stale the
   other way — and is fixed alongside this capture. The decisions page should record which surface
   runs which until the template migrates.
