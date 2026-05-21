# Convex Native AI App Builder Competitor Research

## Document Control

- Status: Draft research
- Owner: Noter market positioning and recommended app stack
- Created: 2026-05-18
- Last checked: 2026-05-18

## Prompt

Find direct competitors for Vly and Noter in the narrow niche of AI app builders that generate
applications with Convex as the backend. Treat generic AI builders as adjacent unless public
material shows Convex is the default or a core generated backend path.

## Current Finding

The exact niche is small but real. The direct web competitors are not just Chef and Vly. The two
meaningful independent names to watch are `cto.new` and `Converge`.

`cto.new` is the closest match to the Noter stack thesis because it publicly combines Convex with
TanStack-generated web apps. `Converge` is the most direct public positioning competitor because it
explicitly argues that Convex is a better AI-generated-app backend than Supabase and says every
generated app runs on Convex.

Mobile-native Convex app builders are also clustering around Expo, React Native, and Convex. That
category includes BNA, Vibra Code, Bloom, and a0.dev.

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

### Converge

- URL: [Converge](https://converge.run/)
- Evidence:
  [The AI App Builder That Builds Real Apps](https://converge.run/blog/converge-the-ai-app-builder-that-builds-real-apps)
- Directness: Very high

Public material says every app built in Converge runs on Convex. The product claims generated apps
include database, backend logic, authentication, real-time sync, hosting, deployment, AI agents,
email, payments, files, search, maps, and scheduled tasks.

Competitive read: this is the clearest narrative competitor. It directly frames Convex as the
AI-native backend choice and contrasts that with Supabase-style manual configuration.

### Chef by Convex

- URL: [Meet Chef](https://news.convex.dev/meet-chef/)
- Directness: High, but platform-owned

Chef is the official Convex app builder/reference product. It is a direct Convex-backed
app-generation surface, but it is not an independent startup competitor in the same sense as Vly,
cto.new, Converge, or Noter.

Competitive read: Chef matters as upstream ecosystem gravity. It can validate the niche, shape user
expectations, and seed patterns that independent builders copy or specialize.

### Vly

- URL: [Vly docs](https://docs.vly.ai/)
- Directness: High

Vly documents generated projects as React, Vite, Convex, and Tailwind, with automatic deployment and
custom domain support.

Competitive read: Vly is a real Convex-native builder, but its moat depends on managed lifecycle,
deployment, auth, domains, and reliability rather than raw AI code generation. Raw coding agents are
cheaper for technical users.

## Mobile And Native Convex Builders

### BNA

- URL:
  [BNA on Product Hunt](https://www.producthunt.com/products/bna-3/launches/bna-6?comment=5249034)
- Directness: High for mobile

Public launch material says BNA generates Expo React Native apps with Convex, real-time backend,
database/API layer, authentication, light/dark mode, and downloadable code.

Competitive read: BNA is not in the exact web-app lane, but it is part of the same Convex-native
app-builder pattern for mobile.

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
- Directness: Medium

Bloom positions itself as an AI app builder for full-stack native apps and lists Expo, React, and
Convex in public hiring material. Public evidence does not yet prove that every generated app uses
Convex by default.

Competitive read: monitor closely, but keep it in the mobile/native bucket until public docs confirm
Convex as the generated backend default.

### a0.dev

- URL: [a0.dev Convex integration announcement](https://www.a0.io/blog/phase-1-wagma)
- Directness: Medium

a0.dev is a React Native AI app builder that announced Convex integration for real-time features.
Current public evidence reads as Convex-capable rather than Convex-default.

Competitive read: adjacent mobile competitor unless Convex becomes its default backend path.

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

New findings should update this document with:

1. product name
2. source URL
3. whether Convex is default, optional, or only mentioned
4. generated UI/runtime stack
5. competitive relevance to Noter
