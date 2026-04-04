# Lovable positioning and pitch-deck notes

Date: 2026-04-04

## Scope

Capture public research on Lovable's pitch-deck evolution and current product
positioning, then compare that to Noter so future messaging can decide whether
to compete with Lovable directly or frame Noter as a different layer.

This note is exploratory. It is not a product spec.

## Public Lovable timeline

### Earliest fundraising

- The earliest publicly visible investor note says byFounders backed Anton Osika
  and Fabian Hedin before there was a public product or a pitch deck.
- Working interpretation: the first money was a founder-and-vision bet rather
  than a formal deck process.

### 2025-02-25 pre-Series A story

- Lovable's public round announcement and Creandum's investment note both frame
  the company through explosive top-line traction.
- Repeated proof points:
  - `$17M ARR`
  - `30,000` paying customers
  - `25,000` new projects per day
  - `1.2M` apps built
- Working interpretation: this stage reads like a classic "growth is the whole
  story" deck.

### 2025-07-17 to 2025-07-23 Series A story

- Public reporting shifts from raw launch traction to category leadership and
  enterprise credibility.
- Repeated proof points:
  - `$200M` raised at a `$1.8B` valuation
  - `2.3M` active users
  - `180,000` paying subscribers
  - `$100M ARR` within eight months
- Working interpretation: the deck/story matured from "people love this" to
  "this is becoming the default way a large new category gets built."

### 2025-12-03 leaked deck reporting

- Sifted reported that a Lovable deck circulated earlier in 2025 targeted `65%`
  gross margins by the second half of 2026.
- Working interpretation: later-stage fundraising added a much heavier unit
  economics and durability layer on top of the earlier growth narrative.

### 2025-12-18 Series B story

- Public Series B messaging reads as more enterprise-operator oriented than the
  earlier "anyone can build" story.
- Repeated proof points:
  - `100,000+` new projects per day
  - `25M+` total projects in the first year
  - large-company case studies and operator workflows
- Working interpretation: the mature story is no longer just app generation; it
  is deployment, organizational adoption, and business durability.

## What Lovable is, in current public terms

- A broad AI app builder aimed at founders, PMs, designers, marketers, and
  developers.
- The core promise is fast translation from idea to working app.
- GitHub is present as an integration boundary, not the primary product
  substrate.
- The main strength is low cognitive load and fast time to first visible output.

## What Noter appears to be

Based on the current repo state:

- Noter describes itself as a collaborative, GitHub-connected code editor.
- The public landing copy emphasizes that notes and code live in a real
  repository, collaboration is real time, the workspace works on desktop and
  mobile, and Codex can ship small apps from inside the workspace.
- Current shipped capabilities already include:
  - repo connection for existing GitHub repositories
  - managed repo creation for noter-owned vaults
  - infrastructure provisioning for new vaults
  - approval-gated commit and production-read flows
  - connected-machine and machine-local Codex thread work
- Working interpretation: Noter is closer to a repo-native collaborative
  workspace and control plane for human-and-agent software work than to a
  generic AI app builder.

The slogans file is especially revealing. It includes lines such as:

- "if Lovable could build Lovable"
- "the tech stack for AI Agents"
- "a dev environment for your codex agent"
- "durable ad-hoc software"

That suggests the internal ambition is not just "AI app builder" but something
closer to durable infrastructure for agent-mediated software creation and
operation.

## Comparison

### Where Lovable is stronger

- broader audience and clearer default job to be done
- much easier first-run story
- stronger public momentum and social proof
- a product narrative that is legible even to non-technical buyers

### Where Noter could be stronger

- repo-first ownership from day zero
- real collaboration rather than solo generation plus later handoff
- explicit approvals and operational boundaries
- infrastructure and runtime state as first-class concerns
- connected machines, MCP, and web-first agent control
- portability for software that needs to outlive the first prototype

## Messaging implications for Noter

- Noter should probably not try to out-Lovable Lovable on the "blank prompt to
  app in minutes" axis.
- The sharper wedge is the durable layer after the prototype exists:
  collaborative ownership, ongoing iteration, approvals, infra, and agent
  operation on a real repository.
- A useful framing is:
  - Lovable is the fastest way to create an app.
  - Noter could become the best place to own, evolve, and operate one.
- There is also a plausible complement path:
  - prototype in Lovable
  - export or sync to GitHub
  - continue long-lived work inside Noter

## Open questions

- Should Noter's first public wedge be repo-first, agent-first, or mobile-first?
- Which segment is the best entry point:
  - solo technical founders
  - AI-native product teams
  - internal-tool builders
- Should future pitch material name Lovable directly or keep the contrast
  implicit?
- What is the clearest plain-English version of "durable ad-hoc software"?

## Sources

External:

- [byFounders LinkedIn post](https://www.linkedin.com/posts/byfounders_we-met-anton-and-fabian-before-lovable-as-activity-7351596553276403712-HD11)
- [Lovable fundraise announcement, 2025-02-25](https://lovable.dev/blog/company-news/fundraise-series-a-announcement)
- [Creandum backing Lovable note](https://creandum.com/stories/backing-lovable/)
- [TechCrunch, 2025-02-25](https://techcrunch.com/2025/02/25/swedens-lovable-an-app-building-ai-platform-rakes-in-16m-after-spectacular-growth/)
- [Lovable Series A announcement](https://lovable.dev/blog/company-news/200m-series-a-fundraise)
- [TechCrunch, 2025-07-23](https://techcrunch.com/2025/07/23/eight-months-in-swedish-unicorn-lovable-crosses-the-100m-arr-milestone/)
- [Sifted leaked deck report, 2025-12-03](https://sifted.eu/articles/lovable-margins-leaked-pitch-deck/)
- [Lovable Series B announcement](https://lovable.dev/pt-br/blog/company-news/series-b)
- [Lovable docs welcome](https://docs.lovable.dev/introduction/welcome)
- [Lovable GitHub integration docs](https://docs.lovable.dev/integrations/github)
- [Lovable Cloud docs](https://docs.lovable.dev/integrations/cloud)
- [Lovable for product managers](https://lovable.dev/product-managers)

Internal:

- [README.md](../README.md)
- [apps/noter/src/lib/landingCopy.ts](../apps/noter/src/lib/landingCopy.ts)
- [slogans.md](../slogans.md)
- [specs/077_CONNECTED_MACHINE_MAIN_THREAD_SURFACE_SPEC.md](../specs/077_CONNECTED_MACHINE_MAIN_THREAD_SURFACE_SPEC.md)
