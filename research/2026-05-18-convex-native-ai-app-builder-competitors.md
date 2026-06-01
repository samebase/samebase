# Convex Native AI App Builder Competitor Research

## Document Control

- Status: Draft research
- Owner: Noter market positioning and recommended app stack
- Created: 2026-05-18
- Last checked: 2026-06-01

## Prompt

Find direct competitors for Vly and Noter in the narrow niche of AI app builders that generate
applications with Convex as the backend. Treat generic AI builders as adjacent unless public
material shows Convex is the default or a core generated backend path.

## Current Finding

The exact niche is small but real. The direct web competitors are not just Chef and Vly. The three
meaningful independent names to watch are `cto.new`, `Converge`, and `VibeFlow`.

`cto.new` is the closest match to the Noter stack thesis because it publicly combines Convex with
TanStack-generated web apps. `Converge` is the most direct public positioning competitor because it
explicitly argues that Convex is a better AI-generated-app backend than Supabase and says every
generated app runs on Convex.

`VibeFlow` is a direct workflow-plus-app-builder entrant that was missing from the first pass. It
uses Convex as its real-time database, generates TypeScript workflows plus optional frontend UI, and
positions editable workflow graphs as the antidote to black-box AI-generated backends.

Mobile-native Convex app builders are also clustering around Expo, React Native, and Convex. That
category includes BNA, Vibra Code, Bloom, and a0.dev.

June 1 update: `CLONK` should be added as a likely direct watch target, but not yet as a confirmed
Convex-default builder. Its homepage advertises one-shot full-stack app generation, Expo mobile
apps, one-click deploy, existing Claude Code/Codex usage, and "Backend Pre-Cooked convex". That is
strong public stack evidence, but generated-output evidence is still needed before treating Convex
as proven default.

## High-Priority Watch Items

### 2026-06-01

1. `cto.new` is pushing beyond hosted app generation into a free local CLI. The new CLI page says
   users can build web apps, mobile apps, CLIs, and AI agents locally, with Convex built in for auth
   and database, one-click deployment, multi-agent teams, web browsing, email, scheduling, and MCP
   or skills support. The CLI docs say it runs on Mac and Linux and is a provider/plugin built on
   OpenCode. This matters because cto.new is no longer only competing on prompt-to-hosted-app; it is
   moving into the local operator workflow where Noter wants durable source and environment control.
2. `VibeFlow` now has stronger public control-plane evidence. Its MCP docs expose project tools to
   initiate builds, poll status, open editor URLs, export flow JSON, and manage design systems from
   MCP-compatible clients. Its founder page shows generated `convex/` code and says workflows get a
   real database, auth, TypeScript code, export, and optional generated UI. Its terms say deployed
   applications utilize Convex infrastructure and discuss Convex usage monitoring and billing. This
   strengthens VibeFlow as a direct control-and-observability competitor, not just a prompt builder.
3. Convex added more app-builder substrate: the Platform API docs now describe per-deployment usage
   tracking for AI app builders that create many deployments, and the May 29 Convex releases add
   typesafe environment variable declarations, request metadata, local deployment options, and
   snapshot queries. This is not competitor movement by itself, but it reduces the amount of custom
   platform work Convex-native builders need for metering, quotas, abuse response, and reliable
   generated-app operations.

## Direct Web Competitors

### cto.new

- URL: [cto.new](https://cto.new/)
- Convex evidence: [Why We Bet on Convex](https://cto.new/blog/why-we-bet-on-convex)
- Stack evidence: [cto.new changelog](https://docs.cto.new/changelog)
- Directness: Very high

Public positioning says web app projects have Convex built in for database, authentication, file
storage, search, scheduled jobs, background jobs, and email. The changelog says generated web apps
auto-deploy and configure a TanStack codebase.

Competitive read: this is the strongest direct competitor found so far because it matches the
"TanStack plus Convex is more legible to LLMs" stack direction.

May 25 update: the latest public changelog entry found is April 30, 2026. Material movement since
the baseline includes improved Convex dashboard support, Expo app generation and preview support,
agent team marketplace features, email wakeups for agents, and reliability work around preview
recovery, restart handling, proxy behavior, and sandbox cleanup.

June 1 update: the latest public changelog entry found is still April 30, 2026, but cto.new has a
new public CLI surface:

- CLI evidence: [cto.new CLI](https://cto.new/cli) and [CLI docs](https://docs.cto.new/cli)
- GitHub evidence: [Engine Labs GitHub](https://github.com/Engine-Labs)

The CLI page advertises a free local builder for web apps, mobile apps, agents, and CLIs, with
Convex built in for auth and database, one-click deployment, cloud sandboxes, multi-agent teams, and
MCP or skills support. The GitHub org shows public `homebrew-cto` and `cto-cli` repositories updated
May 18, 2026. Competitive read: treat cto.new as a local-workflow competitor now, not only a hosted
AI web-app-builder competitor.

### Converge

- URL: [Converge](https://converge.run/)
- Evidence:
  [The AI App Builder That Builds Real Apps](https://converge.run/blog/converge-the-ai-app-builder-that-builds-real-apps)
- Changelog evidence: [Converge changelog](https://converge.run/changelog)
- Directness: Very high

Public material says every app built in Converge runs on Convex. The product claims generated apps
include database, backend logic, authentication, real-time sync, hosting, deployment, AI agents,
email, payments, files, search, maps, and scheduled tasks.

Competitive read: this is the clearest narrative competitor. It directly frames Convex as the
AI-native backend choice and contrasts that with Supabase-style manual configuration.

May 25 update: no newer public changelog entry was found after February 26, 2026. The latest
material updates remain component and reliability oriented: Nano Banana 2 as the image component
default, assets stored in the project's Convex backend, Claude 4.6 model defaults, credit referrals,
custom domains through Netlify, sandbox reliability, and components for maps, email, payments,
scheduled tasks, RAG, and AI agents.

June 1 update: no newer public changelog entry was found after February 26, 2026. Converge remains a
direct narrative competitor because the changelog and positioning still say generated apps use
Convex and project assets live in the project's Convex backend.

### VibeFlow

- URL: [VibeFlow docs](https://docs.vibeflow.ai/introduction)
- Launch evidence: [Launch HN: VibeFlow](https://news.ycombinator.com/item?id=45084759)
- Positioning evidence: [VibeFlow on Product Hunt](https://www.producthunt.com/products/vibeflow)
- Directness: Very high

Public docs describe VibeFlow as an AI-powered workflow platform with a built-in database and
optional frontend. It generates production-ready TypeScript workflows with APIs, automations,
integrations, database schema, business logic, and optional frontend UI. Its docs say VibeFlow uses
Convex as its real-time database solution. Its HN launch says VibeFlow uses Convex as the backend
and maps workflow graphs to deterministic code templates.

Competitive read: this is a direct Noter watch target because it competes on control of generated
backend logic, not only prompt-to-UI generation. GitHub sync, frontend import or cloning, MCP tools,
custom domains, integrations, and visual workflow graphs all overlap with the "make generated apps
operable and inspectable" part of Noter's thesis.

June 1 update:

- MCP evidence: [VibeFlow MCP](https://docs.vibeflow.ai/features/mcp)
- Founder positioning evidence: [VibeFlow for Founders](https://vibeflow.ai/founders/)
- Terms evidence: [VibeFlow terms](https://app.vibeflow.ai/terms)

VibeFlow now publicly documents an MCP server for editor-based project creation and control. The
`initiate_project` tool handles workflows, database, frontend, and auth when needed; other tools
poll build status, open editor URLs, export flow JSON, and manage design systems. The founder page
shows a generated `convex/` folder and Convex imports in the code layer, and the terms say deployed
applications use Convex infrastructure with usage monitoring and user responsibility for Convex
charges. Competitive read: this makes VibeFlow more directly comparable to a Noter control plane
because it exposes app creation through MCP and talks about per-app Convex cost management.

### Chef by Convex

- URL: [Meet Chef](https://news.convex.dev/meet-chef/)
- Platform update evidence: [Ship by Convex](https://ship.convex.dev/)
- Platform API evidence: [Tracking Usage](https://docs.convex.dev/platform-apis/track-usage)
- Directness: High, but platform-owned

Chef is the official Convex app builder/reference product. It is a direct Convex-backed
app-generation surface, but it is not an independent startup competitor in the same sense as Vly,
cto.new, Converge, or Noter.

Competitive read: Chef matters as upstream ecosystem gravity. It can validate the niche, shape user
expectations, and seed patterns that independent builders copy or specialize.

May 25 update: Convex's May 8, 2026 release added deployment-token support for scripts that
configure agent environments with access scoped to their own cloud deployment. That is not
Chef-specific, but it strengthens the operational substrate for Convex-native AI app builders.

June 1 update: Convex's May 29, 2026 releases added typesafe required environment variables, request
metadata in mutations and actions, local deployment selection improvements, and snapshot queries.
Convex's Platform API docs now explicitly describe tracking usage for products like AI app builders
that create one Convex deployment per generated app. Competitive read: Chef and the broader Convex
ecosystem are making metering, generated deployment management, and agent-risk reduction more
first-class, which can narrow Noter's infrastructure differentiation unless Noter stays ahead on
operator workflow and auditability.

### Vly

- URL: [Vly docs](https://docs.vly.ai/)
- Homepage evidence: [vly.ai](https://vly.ai/)
- Trust signal evidence: [Vly on Trustpilot](https://www.trustpilot.com/review/vly.ai)
- Directness: High

Vly documents generated projects as React, Vite, Convex, and Tailwind, with automatic deployment and
custom domain support.

Competitive read: Vly is a real Convex-native builder, but its moat depends on managed lifecycle,
deployment, auth, domains, and reliability rather than raw AI code generation. Raw coding agents are
cheaper for technical users.

May 25 update: Vly's public positioning is now more aggressive against Bolt, Replit, and Base44. The
homepage emphasizes vly agent 2.0, Claude Code, OpenAI Codex, Gemini CLI, Convex, React, Daytona,
backend visualization, 1000+ integrations, and a $3 starting price. A trust/reputation watch item is
also warranted: Trustpilot currently marks Vly's rating unavailable due to a guidelines breach and
says the company is displaying Trustpilot content in a misleading way.

June 1 update:

- Feature docs: [Vly features](https://docs.vly.ai/features)
- Database docs: [Vly database access](https://docs.vly.ai/features/database-access)
- Versioning docs: [Vly version control](https://docs.vly.ai/features/version-control)

Vly's docs now publicly detail direct Convex database access through a Vly interface, with
development and production environments, schema visualization and editing, query history, JSON/CSV
export, environment variables, and role-based access. The feature overview also lists automatic
checkpoints, Git-based versioning, rollback, and branch management; the versioning page says every
AI iteration creates a git checkpoint and collaborators stay synced when reverting. Competitive
read: Vly is explicitly competing on backend visibility and safe rollback now, not only generation
and deployment. The Trustpilot warning remained visible in the June 1 pass.

### CLONK

- URL: [CLONK](https://www.clonk.ai/)
- Convex evidence: homepage says "Backend Pre-Cooked convex" and lists Convex in the "build with"
  stack.
- Directness: Likely high, but generated-output evidence still needed

CLONK positions itself as a low-cost one-shot full-stack app builder and Mac app for commanding code
agents. It advertises real deployed apps, one-click deploy, full-stack apps with auth, database,
payments, deployment, Expo mobile apps, Vercel, GitHub, Convex, Claude Code, OpenAI Codex, and
pricing framed against Lovable, Bolt, Replit, and other credit-burning builders.

Convex read: public evidence makes Convex look like a core backend choice, but it does not yet prove
that every generated app uses Convex by default. Competitive read: monitor immediately because its
positioning attacks the same failure loop as Convex-native builders: "real deployed apps, not
mockups", cheaper than credit-based builders, and backend pre-wired.

## Mobile And Native Convex Builders

### BNA

- URL:
  [BNA on Product Hunt](https://www.producthunt.com/products/bna-3/launches/bna-6?comment=5249034)
- Built-with evidence: [Products used by BNA](https://www.producthunt.com/products/bna-3/built-with)
- Directness: High for mobile

Public launch material says BNA generates Expo React Native apps with Convex, real-time backend,
database/API layer, authentication, light/dark mode, and downloadable code.

Competitive read: BNA is not in the exact web-app lane, but it is part of the same Convex-native
app-builder pattern for mobile.

May 25 update: Product Hunt's built-with page still lists Convex as BNA's backend foundation and
says BNA generates complete Expo React Native apps with Convex, realtime backend, database/API
layer, and auth. No material web-lane move was found.

### Vibra Code

- URL: [sa4hnd/vibra-code](https://github.com/sa4hnd/vibra-code)
- Directness: Medium to high for mobile

The repository describes itself as an open-source AI app builder for mobile using Claude Code, Expo,
React Native, Convex, and E2B.

Competitive read: this is probably more ecosystem signal than immediate commercial threat, but
open-source projects can normalize the stack and become reference implementations.

### Bloom

- URL:
  [Bloom YC job post](https://www.ycombinator.com/companies/bloom-4/jobs/VAkpMHI-ai-engineering-student-internship-winter-or-summer-2026)
- Podcast evidence:
  [Swisspreneur episode with Bloom co-founder](https://podscan.fm/podcasts/swisspreneur-show/episodes/build-amp-share-native-apps-from-your-phone-bloom-co-founder-amp-ceo-david-oort-alonso-552)
- Directness: Medium

Bloom positions itself as an AI app builder for full-stack native apps and lists Expo, React, and
Convex in public hiring material. Public evidence does not yet prove that every generated app uses
Convex by default.

Competitive read: monitor closely, but keep it in the mobile/native bucket until public docs confirm
Convex as the generated backend default.

May 25 update: April 2026 podcast metadata and transcript reinforce Bloom's mobile app-builder
positioning, Expo/Convex context, frontend-and-backend generation, real-time sync examples, YC
context, and a reported $3.4M raise. This is still Convex-mentioned rather than Convex-default
public evidence.

### a0.dev

- URL: [a0.dev Convex integration announcement](https://www.a0.io/blog/phase-1-wagma)
- Runtime evidence: [a0.dev upgrade docs](https://docs.a0.dev/advanced/upgrading-your-project)
- Directness: Medium

a0.dev is a React Native AI app builder that announced Convex integration for real-time features.
Current public evidence reads as Convex-capable rather than Convex-default.

Competitive read: adjacent mobile competitor unless Convex becomes its default backend path.

May 25 update: current docs emphasize Expo runtime and React Native/Expo SDK upgrade mechanics. No
new public evidence was found that Convex is the default backend for generated apps.

## Adjacent But Not Exact

### Tempo

- URL: [Convex and Tempo](https://news.convex.dev/convex-and-tempo/)
- Template evidence:
  [Vite, Clerk, Convex, and Stripe](https://tempolabsinc.mintlify.app/ViteClerkConvexStripe)
- Directness: Medium

Tempo has Convex integrations and templates, but public evidence does not show Convex as the default
backend for all generated apps.

### KaijuHub AI

- URL:
  [KaijuHub project creation docs](https://www.kaijuhub.ai/es/support/centro-de-proyectos/crear-proyectos)
- Directness: Low to medium

KaijuHub lets users choose TanStack Start and Convex while creating projects. That makes it
Convex-capable, not clearly Convex-native.

### Generic AI App Builders

Bolt, Lovable, Replit, v0, Blink, and similar products can be prompted to use Convex or integrated
with Convex after generation. They are not direct competitors in this research unless they publish a
default Convex backend path.

May 25 update: no new public evidence was found that Bolt, Lovable, Replit, v0, or Blink now use
Convex as a default generated backend path.

June 1 update: no new public evidence was found that Bolt, Lovable, Replit, v0, or Blink now use
Convex as a default generated backend path. v0's May 2026 changelog and full-stack docs are still
worth watching because v0 is adding stronger full-stack project, Git, sandbox, terminal, and Python
services support, but its full-stack docs say v0 defaults to Next.js and connects to databases such
as Supabase, Neon, and Upstash rather than Convex by default.

## Market Interpretation

The competitive pattern is:

1. Generic AI app builders chase the largest market by owning prompt to deploy.
2. Convex-native builders chase correctness, real-time behavior, and backend legibility for LLMs.
3. TanStack plus Convex is emerging as a more AI-legible full-stack shape than large framework
   surfaces with implicit runtime behavior.
4. Mobile builders are separately converging on Expo, React Native, and Convex.

For Noter, the actionable lever is not "also generate apps." It is to make the Convex-backed
lifecycle visibly safer and more controllable: typed app model, source ownership, deployment
ownership, durable infrastructure state, and operator-grade observability.

## Monitoring Baseline

Track new products that satisfy at least one of these conditions:

1. Publicly claims generated apps use Convex by default.
2. Ships a template where Convex is the primary backend with React, TanStack, Vite, Expo, or React
   Native.
3. Mentions Convex as the backend for an AI app builder in docs, changelogs, launch posts, GitHub
   repositories, Product Hunt launches, YC pages, or Convex community posts.
4. Claims to be an alternative to Vly, Chef, Converge, cto.new, Bolt, Lovable, Replit, v0, or Blink
   while using Convex as the generated backend.

Search phrases worth reusing:

- `"Convex" "AI app builder"`
- `"Convex" "vibe coding"`
- `"Every app" "runs on Convex"`
- `"Convex backend" "AI app builder"`
- `"TanStack" "Convex" "AI app builder"`
- `"Expo" "React Native" "Convex" "AI app builder"`
- `"Vite" "Clerk" "Convex" "AI app builder"`
- `"alternative to Vly" "Convex"`
- `"alternative to Chef" "Convex"`
- `"VibeFlow" "Convex"`
- `"VibeFlow" "GitHub" "Convex"`
- `"Lovable" "n8n" "Convex"`
- `"CLONK" "Convex"`
- `"Backend Pre-Cooked" "convex"`

New findings should update this document with:

1. product name
2. source URL
3. whether Convex is default, optional, or only mentioned
4. generated UI/runtime stack
5. competitive relevance to Noter

When this recurring research automation finds material repo changes to make, update this note,
commit the change, push the branch, and create or update a ready GitHub PR before returning the
operator report.
