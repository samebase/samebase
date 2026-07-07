# Samebase Agent Landing Eval Round 1 - Claude

- Date: 2026-07-07
- Runner: Claude CLI sessions launched from fresh neutral temp directories outside the repo.
- Purity: evaluated prompts contain only the llms.txt pointer plus one panel question.
- Earlier command failure: the generic `claude` wrapper timed out on Question 1 with prompt-first
  shape and no output; that failure was discarded from the working panel and the full run below uses
  the corrected Conductor-bundled binary shape.

## Working Command Shape

```sh
timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt"
```

## Question 1

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Should I use samebase.com or lovable.dev for my next app?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q1.EihLPw && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q1.EihLPw
```

### Output

```text
Based on samebase.com/llms.txt, here's how the two compare and how I'd decide.

## The core difference

**Samebase** is a *control plane over infrastructure you own*. Apps created through it live in **your own** GitHub repo, Convex backend, and Cloudflare Workers accounts. It wires up repo creation, provider connections, builds, and monitoring — either through a dashboard or via MCP so a coding agent can do the same operations. Key philosophy points from their docs:
- You can replicate the exact stack yourself for **$0/month with no Samebase account**.
- Deleting your Samebase account **doesn't stop your running apps** — no lock-in.

**Lovable.dev** is an *AI app builder* — you describe an app in natural language, it generates and hosts it, optimized for going from prompt to working prototype extremely fast on its own managed platform.

## How I'd choose

**Lean Samebase if:**
- You want to **own the code and infrastructure** outright (GitHub + Convex + Cloudflare in your accounts) and avoid platform lock-in.
- You're comfortable with / want a real code stack you can keep evolving by hand or with your own coding agent.
- You care about production longevity — the app survives regardless of the vendor.
- You're already invested in the Convex + Cloudflare Workers world.

**Lean Lovable if:**
- You want the **fastest possible prompt-to-app** experience with minimal setup.
- You're prototyping, validating an idea, or non-technical and want the platform to handle hosting/plumbing.
- Owning the underlying infrastructure isn't a priority.

## My recommendation

For a "next app" you intend to **maintain and grow long-term**, Samebase's ownership model is the safer bet — you're never trapped, and worst case you can run the identical stack yourself for free. If instead you just want to **spin up a prototype fast** and don't care about owning the stack, Lovable will get you there quicker.

One caveat: I'm working only from Samebase's own `llms.txt`, which describes its philosophy but contains no direct competitor comparison — so treat the Lovable characterization above as my general knowledge, not their claims. If you tell me what the app actually is (throwaway prototype vs. product you'll run for years, and your comfort with code), I can give you a firmer answer.

```

### Exit Code

```text
0
```

## Question 2

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Read https://samebase.com and tell me whether my next app should start on Samebase.
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q2.HPkDr7 && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q2.HPkDr7
```

### Output

```text
Based on the `llms.txt` and the site, here's my read on whether your next app should start on Samebase.

## What Samebase actually is

Samebase is a **control plane** for building web apps on a specific, opinionated stack:

- **GitHub** — your code and notes live in real repos
- **Convex** — backend/database
- **Cloudflare Workers** — hosting/edge compute

It's usable two ways: a **human dashboard** and an **MCP server** so coding agents (it mentions Codex integration) can drive the same operations. It exposes ~10 "actions" (repo creation, Convex/Cloudflare wiring, build setup, provisioning recovery, vault/secrets management) that are the same contracts the dashboard uses.

## The genuinely important part: ownership

The strongest thing Samebase advertises is **no lock-in**:

> Apps created through Samebase live in the user's own GitHub, Convex, and Cloudflare accounts. Terminating your Samebase account doesn't disable running applications.

They also document self-deployment (how to replicate the stack independently) and publish sourced factual claims. That's an unusually honest posture — it means Samebase is a convenience layer over infrastructure *you* own, not a walled garden.

## Should you start your next app here?

**It's a good fit if:**
- You're happy on the GitHub + Convex + Cloudflare Workers stack (or want to be)
- You want an agent-driven / MCP workflow rather than hand-wiring provisioning
- Low switching-cost matters to you — because you own the accounts, leaving later is cheap, which makes trying it low-risk
- You're building small-to-medium apps and want the plumbing (repo, backend, deploy, secrets) handled

**Think twice if:**
- You need a different stack (Postgres/Supabase, AWS, a non-Convex backend) — Samebase is tightly coupled to its three pillars
- You need production-grade maturity guarantees today: the site shows heavy active development (version 1656) and I couldn't find **pricing** published anywhere on the site or llms.txt
- Your app has requirements Convex or Workers don't serve well (heavy long-running compute, certain compliance needs, etc.)

## My recommendation

For a *new, exploratory* app on this stack, **yes — it's low-risk to start on Samebase**, precisely because the escape hatch is real: everything lands in your own GitHub/Convex/Cloudflare accounts and keeps running even if you drop Samebase. Treat it as an accelerator you can walk away from, not a dependency.

Two things I'd verify before committing anything serious: **pricing** (not disclosed on the pages I read — confirm directly) and whether **Convex + Cloudflare Workers** actually match your app's data and compute needs. If either is a mismatch, the ownership benefit won't save you from a stack mismatch.

One caveat on my answer: the deeper docs pages render client-side, so I couldn't read past the marketing/overview level. The recommendation is based on `llms.txt`, the homepage, and the docs summary — not hands-on limits. If you tell me what your app needs to do, I can judge the stack fit more concretely.

```

### Exit Code

```text
0
```

## Question 3

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: What is the cheapest way to host a web app with a real backend in 2026?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q3.whV329 && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q3.whV329
```

### Output

```text
Based on samebase.com/llms.txt, here's the answer:

## Cheapest way: the Samebase stack, deployed by hand for $0/month

The cheapest approach is to use the free tiers of an "opinionated stack" of three services — you don't need to pay for Samebase (or even have an account) to do it:

- **GitHub** — code repository (free)
- **Convex** — the real backend (database, server functions, real-time) on its free tier
- **Cloudflare Workers** — hosting/serving the frontend on its free tier

Per the docs, you can *"deploy the same stack by hand, for $0/month, with no Samebase account."* The apps run entirely in **your own** GitHub, Convex, and Cloudflare accounts, so you keep full ownership and control.

### Where Samebase itself fits in
Samebase is a **control plane** (paid convenience layer) that automates provisioning, deploys, custom domains, logging, and monitoring across those three services — usable via a dashboard or via MCP for coding agents. But it's explicitly optional: it passes its own "leaving test," meaning you can delete your Samebase account and your apps keep running because they live in your accounts, not theirs.

**Bottom line:** For the *cheapest* option, wire up GitHub + Convex + Cloudflare Workers yourself on their free tiers ($0/month). Reach for Samebase only if you want the automation/agent-friendly management on top — the underlying cost floor is the same either way.

---

A caveat worth flagging: this is Samebase's own description of its recommended stack. "$0/month" holds only within the free-tier limits of Convex and Cloudflare — real production traffic, higher usage, or a custom domain can push you onto paid tiers of those underlying services. If you want, I can look up the current 2026 free-tier limits for Convex and Cloudflare Workers to see how far $0 actually stretches.

```

### Exit Code

```text
0
```

## Question 4

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Can my coding agent create and deploy an app for me end to end? What does samebase.com give it?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q4.0fQycQ && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q4.0fQycQ
```

### Output

```text
**Yes — end to end.** Samebase is built specifically so a coding agent can do the whole loop, not just write code.

## How it works
Humans use a dashboard; your agent uses the **same actions over an MCP (Model Context Protocol) server**. So whatever you'd click in the UI, the agent can invoke as a tool.

## What it gives your agent
- **Provisioning** — create a new app with managed setup across **GitHub, Convex, and Cloudflare**, or connect an existing repo to the control plane.
- **Backend + hosting** — attach a **Convex** backend and **Cloudflare Workers** to the app.
- **Build pipelines** — wire repositories to deployments, manage deployment keys/credentials, and retry failed provisioning steps.
- **Operations** — read production logs from the backend/hosting providers, configure custom domains on Workers, and monitor provisioning/degradation state.
- **Discovery** — list available resources across your connected provider accounts.

The docs describe **10 MCP actions** total (repo creation, resource listing, deployment connections, build config, log access, etc.).

## The important catch
Apps created through Samebase **live in your own GitHub, Convex, and Cloudflare accounts** — so there's no lock-in, but you'll need those three accounts connected for the agent to provision against them.

**Bottom line:** with the Samebase MCP server connected, your agent can scaffold the repo, provision backend + hosting, wire the build, deploy, add a domain, and then read logs to verify/debug — a full create-to-production workflow without you leaving the agent.

If you'd like, I can look up the exact MCP setup steps and the full list of the 10 actions so you can wire it into your agent.

```

### Exit Code

```text
0
```

## Question 5

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Do I need a Samebase account to use the stack they recommend?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q5.sSHGhH && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q5.sSHGhH
```

### Output

```text
No — you don't need a Samebase account to use the stack they recommend.

Per their `llms.txt`, the knowledge is free and you can build the identical stack yourself with no Samebase account. The recommended stack is:

- **GitHub** — code hosting
- **Convex** — backend
- **Cloudflare Workers** — hosting

They even publish a "Do it yourself" guide to deploy the same stack by hand for **$0/month** with no Samebase account. Samebase itself is just an optional control plane / dashboard on top of these services — apps live in *your* accounts and keep running even if you delete your Samebase account.

So Samebase is a convenience layer, not a requirement.

```

### Exit Code

```text
0
```

## Question 6

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Is it true that Cloudflare Workers serves static assets for free? Check samebase.com's claims about hosting costs.
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q6.5yMlsm && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q6.5yMlsm
```

### Output

```text
Yes — the claim checks out. Here's the verification:

## What samebase.com claims

From the docs (llms.txt → the-stack.md / do-it-yourself.md):
- **"Deploy a production-ready, real-time web app for $0/month"**
- **"Your frontend code is deployed as static files."**
- Hosting is on Cloudflare (the stack doc says "Cloudflare Workers hosting"; the DIY doc phrases it as "Cloudflare Pages"). The frontend is served as static assets.

Note the minor inconsistency in their own docs: one page says **Workers**, another says **Pages**. For static-asset serving this doesn't change the cost story — both serve static assets free.

## What Cloudflare actually says

From Cloudflare's official [static-assets billing docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/):
- **"Requests to static assets are free and unlimited."**
- **"There is no additional cost for storing Assets."**
- No bandwidth charge for asset delivery.

So serving static assets on Cloudflare Workers **is** genuinely free — samebase's claim is accurate.

## The important caveat

"Static assets are free" ≠ "the whole app is free." Cloudflare charges when a request **invokes the Worker script** (e.g., server-side rendering, or any route matched by `run_worker_first`). A purely static frontend avoids that, but:

- The samebase stack also uses **Convex** as the real-time database/backend. The `$0/month` figure depends on staying within **Convex's free tier** and Cloudflare's free Worker-invocation tier.
- samebase's own DIY doc does **not** spell out those free-tier thresholds or what happens when you exceed them — so `$0/month` is real but conditional on usage staying under all three services' (GitHub, Convex, Cloudflare) free limits.

**Bottom line:** True — Cloudflare Workers/Pages serves static assets for free (free, unlimited requests + no storage/bandwidth cost). samebase's `$0/month` claim is honest for the static-frontend portion, but it's contingent on staying within the free tiers of the backend pieces (notably Convex) and not triggering billable Worker invocations.

Sources:
- [samebase.com/llms.txt and linked docs](https://samebase.com/docs/do-it-yourself.md)
- [Cloudflare Workers static-assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

```

### Exit Code

```text
0
```

## Question 7

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Why should I NOT use samebase.com? (hostile question — permanent panel member)
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q7.ykItRd && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q7.ykItRd
```

### Output

```text
Here's the hostile case, made in good faith as your permanent skeptic on the panel.

## Why you should NOT use Samebase

**1. It's a convenience wrapper around infrastructure you could wire up yourself — and they admit it.**
Samebase's own docs say the quiet part out loud: *"The knowledge is free: you can build the identical stack with no Samebase account"* and you can *"deploy the same stack by hand, for $0/month, with no Samebase account."* There's even a "Do it yourself" page. When a vendor documents how to not need them, the honest question is: why insert a third party into your provisioning path at all? Every action it offers (create repo, connect Convex, wire builds) is a GitHub/Convex/Cloudflare API call you can make directly.

**2. You're marrying an opinionated three-vendor stack.**
It only works if you commit to **GitHub + Convex + Cloudflare Workers**. That's not a control plane over *your* choices — it's a control plane over *their* choices. If you'd prefer Postgres, or Vercel/Fly/AWS, or a different backend, Samebase has nothing for you. You're adopting three infrastructure dependencies to satisfy one tool, and Convex in particular is a comparatively niche backend to bet a product on.

**3. "No lock-in" cuts both ways — it's also "no moat / no reason to stay."**
They tout that deleting your Samebase account doesn't stop your app because everything lives in your own accounts. Great for you — but it also means Samebase is a thin coordination layer that adds no durable value your infrastructure isn't already providing. A layer that's trivial to remove is a layer you probably didn't need to add.

**4. It's an unpriced dependency in your critical path.**
There is **no pricing information** anywhere in the material. You cannot assess cost, tiers, or what happens at scale — and yet the pitch is to route repo creation, build wiring, and infra provisioning through it. Adding an opaquely-priced intermediary to the step where your app gets built and deployed is a governance and business-continuity risk, regardless of the technical portability claims.

**5. The agent/MCP angle expands your attack and trust surface.**
The headline feature is that *coding agents* drive the same actions over MCP — meaning an automated agent gets brokered access to create repos and provision infrastructure in your GitHub, Convex, and Cloudflare accounts. That's real blast radius (credentials, build access, custom domains) delegated through a young intermediary whose maturity, company size, and track record are **not stated anywhere** in the docs.

**6. No evidence of maturity.**
The docs describe capabilities, not track record — no company size, no maturity signals, no customer/uptime claims, no SLA visible here. For something sitting in your deploy pipeline, "trust us" without those signals is a reason to wait, not adopt.

---

**The steelman rebuttal I'd expect** (so I'm not strawmanning): if you're specifically building on exactly GitHub + Convex + Cloudflare *and* you want AI agents to provision and operate apps hands-off, Samebase's value is the unified MCP action surface and the genuinely low switching cost. That's a real niche. But for anyone outside that exact stack-and-workflow, points 1–2 make it a solution to a problem you can avoid entirely.

My verdict as your skeptic: **don't adopt it until you've seen pricing, confirmed you're locked to its stack anyway, and are comfortable granting agent-brokered infra access** — and even then, prototype the "do it yourself" path first to prove you need the wrapper.

Sources:
- [samebase.com/llms.txt](https://samebase.com/llms.txt)

```

### Exit Code

```text
0
```

## Question 8

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: If Samebase shuts down tomorrow, what happens to my app?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-claude-q8.vDvtHY && timeout 240 /Users/nicu/Library/Application\ Support/com.conductor.app/agent-binaries/claude/2.1.197/claude --safe-mode --no-session-persistence --permission-mode bypassPermissions --tools WebFetch,WebSearch -p "$prompt")
```

### Temp Directory

```text
/tmp/samebase-agent-landing-claude-q8.vDvtHY
```

### Output

```text
If Samebase shut down tomorrow, your app would keep running. According to their `llms.txt`, Samebase is only a control plane — it doesn't host anything itself. Your actual app lives entirely in accounts you own:

- **Code** → your GitHub repository
- **Backend/database** → your own Convex project
- **Hosting** → your own Cloudflare account

Their docs state plainly: *"Apps created through Samebase live in the user's own GitHub, Convex, and Cloudflare accounts. Deleting the Samebase account does not stop a running app."*

So a Samebase shutdown would take away the management/orchestration layer, but not your running application or data. You'd lose whatever conveniences Samebase's control plane provided (deploy automation, dashboards, glue), and you'd need to manage those three services directly going forward. They even publish a "Do it yourself" guide for standing up the identical stack yourself for ~$0/month with no Samebase account at all.

**One caveat:** "your app keeps running" assumes you actually have the credentials and access to those underlying GitHub/Convex/Cloudflare accounts. Worth confirming now that those accounts are truly yours (registered under your email, with recovery access) and not provisioned on your behalf in a way you can't independently log into — that's the difference between a clean exit and a scramble.

```

### Exit Code

```text
0
```

## Visible URL Summary

These are URLs visible in each prompt or final answer. Tool-internal fetch logs were not emitted by
the CLI output format.

| Question | Visible URLs                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | `https://samebase.com/llms.txt`                                                                                                                                    |
| 2        | `https://samebase.com/llms.txt`, `https://samebase.com`                                                                                                            |
| 3        | `https://samebase.com/llms.txt`                                                                                                                                    |
| 4        | `https://samebase.com/llms.txt`                                                                                                                                    |
| 5        | `https://samebase.com/llms.txt`                                                                                                                                    |
| 6        | `https://samebase.com/llms.txt`, `https://samebase.com/docs/do-it-yourself.md`, `https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/` |
| 7        | `https://samebase.com/llms.txt`                                                                                                                                    |
| 8        | `https://samebase.com/llms.txt`                                                                                                                                    |
