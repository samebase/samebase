# Idea: Evaluate Augment Code for Noter

Date researched: 2026-03-05

## Why this note exists

Teo raised Augment Code, so this doc captures what it does today and how it could help Noter if we
run a focused pilot.

## What Augment Code offers today (verified from official docs/site)

1. IDE coding agent and chat tools:
   - Supported editors include VS Code, JetBrains IDEs, Vim/Neovim, and CLI.
   - Agent modes include normal agent execution and auto-continue behavior.
   - Built-in workflow helpers include `Tasklist`, `Next Edit`, and workspace-level `Instructions`.
2. Repo-aware context services:
   - Context Engine can be used via MCP.
   - There is an SDK (TypeScript and Python) marked experimental.
   - Context Connectors are open source and experimental.
3. PR/code review workflow:
   - Works through a GitHub App.
   - Can run automatically when PRs become ready for review, or manually via an `auggie review`
     comment.
   - Review comments can be fixed directly from Augment.
4. Parallel/cloud execution:
   - Remote Agent can run tasks in a secure cloud environment and open PRs.
5. Safety/operability:
   - Rules and guidelines support repository policy files like `AGENTS.md`, `CLAUDE.md`, and
     `.augment/rules`.
   - Secret manager encrypts tokens and redacts secrets in outputs.
6. Enterprise controls:
   - Analytics and org-wide quotas are available for Enterprise plans.
   - Team plan includes shared account usage visibility.
7. Security/compliance statements:
   - Site lists SOC 2 Type II and ISO/IEC 42001.
   - Site states paid data is not used for model training.

## Pricing details to keep in mind

From the pricing page (2026-03-05 snapshot):

- Pro: $50/user/month with 130,000 credits included.
- Team: $100/user/month with 250,000 credits included.
- Enterprise: custom pricing with advanced controls.
- Doc examples list rough task costs:
  - Small task: ~300 credits.
  - Complex task: ~4,300 credits.
  - MCP query examples: ~40 to 70 credits.

Quick back-of-envelope:

- Pro plan monthly budget (~130k) could cover roughly:
  - ~430 small tasks (`130000 / 300`)
  - ~30 complex tasks (`130000 / 4300`)

## How this can help Noter specifically

1. Faster onboarding in this large monorepo:
   - Augment's repo context + policy-file support maps to our heavy `AGENTS.md` workflow and could
     reduce ramp-up time for contributors.
2. Better PR quality signal:
   - Add Augment review as another reviewer signal (in addition to current bot feedback loops) for
     regressions and missing tests.
3. Better context retrieval experiments:
   - Context Engine MCP may help with long-context repo lookups and could be tested against current
     Codex/Claude workflows for speed and relevance.
4. Async delegation for repetitive tasks:
   - Remote Agent may be useful for repeatable chores (docs cleanup, lint fix batches, migration
     chores) while developers focus on core product work.
5. Stronger enterprise story:
   - Compliance claims and quota controls may matter if we later pitch Noter to orgs with stricter
     AI governance requirements.

## Risks and constraints

1. Credit burn needs active monitoring:
   - Complex tasks can consume credits quickly, so quotas and guardrails are required early.
2. Feature gating by plan:
   - Some controls (analytics, org quotas) are Enterprise-only.
3. Experimental surfaces:
   - SDK and context connectors are currently labeled experimental.
4. Review noise risk:
   - Adding another review bot can increase review chatter if tuning is weak.

## Suggested pilot (2 weeks)

1. Scope:
   - 2-3 engineers on one active Noter workstream.
   - Enable IDE agent + review integration on a single repo first.
2. Setup:
   - Define shared rules in `.augment/rules` that mirror critical `AGENTS.md` standards (type
     safety, no unsafe git operations, review expectations).
   - Start review mode as manual (`auggie review`) to tune noise before switching to automatic.
3. Metrics:
   - Time-to-first-useful-change for new tasks.
   - PR turnaround time.
   - Number of actionable review findings per PR.
   - Credit use per engineer per week.
4. Exit criteria:
   - Keep if it improves turnaround and review quality at acceptable credit cost.
   - Drop if review noise is high or credit efficiency is poor.

## Sources

- Augment docs home: https://docs.augmentcode.com
- Install Augment Code: https://docs.augmentcode.com/setup/install
- VS Code IDE features: https://docs.augmentcode.com/using-augment/vscode
- Rules and Guidelines: https://docs.augmentcode.com/using-augment/rules-and-guidelines
- Configure MCP Servers: https://docs.augmentcode.com/using-augment/configure-mcp-servers
- Context Services overview: https://docs.augmentcode.com/context/context-services-overview
- Context Engine MCP: https://docs.augmentcode.com/context/context-engine-mcp
- Context Engine SDK: https://docs.augmentcode.com/context/context-engine-sdk
- Context Connectors: https://docs.augmentcode.com/context/context-connectors-overview
- Code Review setup: https://docs.augmentcode.com/code-review
- Remote Agent docs: https://docs.augmentcode.com/using-augment/remote-agent
- Integrations: https://docs.augmentcode.com/using-augment/agent-integrations
- Secrets Manager: https://docs.augmentcode.com/using-augment/secrets-manager
- Augment pricing: https://www.augmentcode.com/pricing
- Augment trust/security page: https://www.augmentcode.com/trust
