# Agent-Native Positioning And Competitor Eval

## Document Control

- Status: Research synthesis, not an accepted product contract
- Date: 2026-07-14
- Purpose: preserve the latest prompt probes, product capability audit, competitor model, and the
  resulting positioning direction
- Related:
  - `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`
  - `research/2026-07-06-agent-landing-eval-questions.md`
  - `research/2026-07-07-agent-landing-eval-round-0.md`
  - `research/2026-07-07-agent-landing-eval-round-1-findings.md`
  - `research/2026-07-06-samebase-pitch-language.md`
  - `research/2026-05-18-convex-native-ai-app-builder-competitors.md`
  - `research/2026-06-28-landing-positioning-ideas.md`

This note synthesizes the later positioning work. It does not replace the detailed round transcripts
or the recurring competitor watch.

## Executive Finding

The causal order matters:

1. GitHub, Convex, and Cloudflare are the best default base we have found for web apps.
2. Once a good default is known, unnecessary stack variation becomes maintenance debt.
3. Samebase lets the coding agent the user already chose repeat and operate that base across many
   apps.
4. The starter template is the introduction. Inventory, provider attachment, verification, repair,
   and monorepo mapping are what keep the second, fifth, and tenth app from becoming separate
   operational systems.

The shortest version is:

> Samebase lets the coding agent you already use create and manage the same proven base across every
> app, so each new app adds a product, not another system to maintain.

Generic infrastructure management is not the central thesis. Existing repositories and partial
stacks are adoption paths. They have real value on their own, but the complete benefit appears when
apps converge on the preferred base.

## Questions Tested

- Can an unaffiliated agent reconstruct Samebase from the public web?
- Does it understand Samebase plus the user's coding agent as the compound app builder?
- Does it choose Samebase for the right reasons rather than simply agreeing with vendor copy?
- Does it choose a competitor or direct provider operation when those better fit the scenario?
- Do friend framing, agent identity, effort level, or local runtime context distort the decision?
- Does the public landing explain existing-app, inventory, partial-stack, and monorepo value?

## Evaluation Method

Each accepted probe ran from a fresh random, non-Git temporary directory with no Samebase repository
context, inherited MCP connections, or project plugins. Standard input was closed, and the agents
used public web sources. Claude and Codex were also crossed where relevant: Claude evaluated
Samebase with Codex, and Codex evaluated Samebase with Claude Code. Low-effort runs were followed by
higher-effort controls when a user constraint or product boundary was missed.

No accepted answer or visible event mentioned the real checkout, local source files, localhost, or
that Samebase is built on this laptop. Runtime identity sometimes surfaced, such as recognizing that
the user was speaking to a coding agent. That is not checkout leakage.

Hidden chain-of-thought was not available. The review inspected visible messages, browsing and tool
events, occasional readable summaries, and final answers. It did not infer private reasoning from
encrypted or empty thinking fields.

## Lovable Prompt Probes

The initial compact prompt was:

```text
Read https://samebase.com. Should I use Samebase with you, or Lovable, for my next app? Check both, choose one, and tell me when the other would be better.
```

Two useful variants were:

```text
Read https://samebase.com/llms.txt. Should I build my next app with Samebase and you, or with Lovable? Check both, choose one, and tell me when the other would be better.
```

```text
My friend is building Samebase and sent me the new landing page before he makes it the homepage: https://samebase.com/landing-preview. He says using Samebase with a coding agent like you is a better way to build my next app than Lovable. I'm skeptical because several people I trust recommend Lovable. Check both and tell me what you'd actually choose. Also tell me when the other is better.
```

| Probe                       | Claude   | Codex    | Important signal                                                      |
| --------------------------- | -------- | -------- | --------------------------------------------------------------------- |
| Direct `/` comparison       | Samebase | Samebase | Production `/` was too sparse, so discovery was fragile               |
| `/llms.txt` comparison      | Samebase | Samebase | Recovered the agent/control-plane split and provider ownership        |
| Friend and skeptic variants | Samebase | Samebase | Skepticism improved calibration instead of merely changing the choice |

The friend frame made agents treat Samebase's claims as self-reported and inspect portability more
carefully. Loaded wording such as "overselling" encouraged security and CVE detours. Saying that a
reachable preview was "not published yet" sometimes made the agent skip it. "Before he makes it the
homepage" preserved the story while still telling the agent to read the URL.

Lovable remained the right reversal for a nontechnical user who wants a visual prompt-to-app
workflow or a weekend prototype without managing source and infrastructure.

## Model, Identity, And Effort Matrix

| Cell | Scenario                                                | Claude low                        | Codex low                        | Higher-effort control                   |
| ---- | ------------------------------------------------------- | --------------------------------- | -------------------------------- | --------------------------------------- |
| B0   | Samebase versus Lovable for a maintained app            | Samebase                          | Samebase                         | Not needed                              |
| B1   | Samebase versus direct agent setup for greenfield       | Samebase plus agent               | Samebase plus agent              | Not needed                              |
| B2   | Samebase versus cto.new                                 | Samebase                          | Samebase                         | Competitor remained under-researched    |
| B3   | Crossed agent identity                                  | Samebase plus Codex               | Samebase plus Claude             | No self-brand bias observed             |
| B4   | One existing healthy GitHub, Convex, and Cloudflare app | Samebase, based on invented value | Direct providers                 | Both higher-effort models chose direct  |
| B5   | Nontechnical weekend app                                | Lovable                           | Samebase, against the constraint | Both higher-effort models chose Lovable |

Lower effort preserved the broad ownership thesis but missed decisive user constraints. Higher
effort corrected those reversals, but it could not recover capabilities that the public landing did
not explain. Recommendation win rate is therefore the wrong acceptance metric. The required outcome
is factual product reconstruction plus a calibrated choice.

The existing-app case also needs two separate expectations:

- One healthy app, no inventory or management need: direct provider tools can win.
- Several apps, mixed provider state, monorepo roots, central visibility, or repair needs: Samebase
  can win.

## CLONK Lifecycle Probe

The crossed prompts were:

```text
Read https://samebase.com/landing-preview. I already use Codex to build several GitHub apps, including a monorepo. Should I add Samebase or use CLONK? Check both, choose one, and tell me when the other would be better.
```

```text
Read https://samebase.com/landing-preview. I already use Claude Code to build several GitHub apps, including a monorepo. Should I add Samebase or use CLONK? Check both, choose one, and tell me when the other would be better.
```

| Model       | Choice             | Material error                                                      |
| ----------- | ------------------ | ------------------------------------------------------------------- |
| Claude low  | Samebase           | Invented existing-repository and monorepo fit instead of finding it |
| Codex low   | CLONK              | Reduced Samebase to greenfield standalone apps                      |
| Claude high | CLONK              | Incorrectly said Samebase required migrating the monorepo to Convex |
| Codex high  | Samebase, narrowly | Limited the recommendation to new or extracted standalone apps      |

All four missed the same shipped facts:

- an existing repository can remain GitHub-only;
- Convex and Cloudflare can be attached later;
- Samebase returns a central inventory of connected apps and their provider state;
- one repository can contain multiple app roots.

This was a public explanation failure, not only a low-effort-model failure.

## Current Product Evidence

| Capability                               | Primary repo evidence                                                  | Meaning                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Existing repository and GitHub-only use  | `apps/samebase/convex/vault/contracts/connectRepository.ts:12`         | Import syncs the repo but does not touch Convex or Cloudflare; either can be attached later or omitted |
| Connected-app inventory and repair state | `apps/samebase/convex/vault/contracts/getUserVaults.ts:153`            | Returns every connected app, app roots, provider resources, coordinates, state, and remedies           |
| Existing Cloudflare adoption             | `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md:25`             | An existing Worker attaches per app root without changing its provider ownership                       |
| Existing Convex adoption                 | `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md:21`             | A deployment can attach later per app root                                                             |
| Monorepo roots                           | `apps/samebase/convex/schema.ts:469`                                   | Provider resources attach to explicit deployable roots inside a repository                             |
| Monorepo dashboard UI                    | `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx:1125` | The user can choose one app or a monorepo and add folder roots                                         |

The boundaries are equally important:

- "Every app" means every app the user connects. Samebase does not automatically discover an entire
  GitHub account.
- Other stacks receive repository and inventory value, but Samebase does not model their non-Convex
  or non-Cloudflare infrastructure.
- Monorepo configuration exists in the dashboard, but no MCP action currently creates app roots.
- A failed `sourceSetup` remains the important degraded state without an explicit `nextAction`.

## The Public-Story Gap

The current overview led with "a button that turns an idea into a running app," followed by "one
place to watch them all" and the fact that an agent can create and list apps. It did not concretize:

- connecting an existing repository;
- useful GitHub-only adoption;
- attaching providers later;
- several deployable roots in a monorepo;
- what the connected-app inventory contains;
- verification and repair over the app lifecycle;
- why repeating the same base makes a growing app portfolio maintainable.

That omission explains why unrelated agents consistently inferred "greenfield scaffold" even when
they used more effort.

## Competitor Category Map

| Layer                         | Products              | Main job                                                                   |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Native coding-agent interface | Codex, Claude Code    | Write and operate code directly                                            |
| Agent cockpit                 | CLONK, Conductor      | Sessions, agents, workspaces, terminals, previews, Git, and remote control |
| Prompt-to-app builder         | Lovable, partly CLONK | Integrated generation and deployment experience                            |
| App-base standardization      | Samebase              | Repeat, inventory, wire, verify, and repair the preferred app base         |

Current primary sources:

- [CLONK](https://www.clonk.ai/) describes itself as the workspace, agent loop, and remote-control
  layer over the AI subscriptions a user already pays for.
- [Conductor's harness overview](https://www.conductor.build/docs/reference/harnesses) explicitly
  defines Conductor as the workspace layer around Claude Code, Codex, Cursor, and OpenCode.
- [Lovable's introduction](https://docs.lovable.dev/introduction/welcome) presents an integrated
  prompt-to-app development platform.

CLONK is not strictly GUI-only. It has background and command-line entry points, while its
orchestration, history, previews, Git controls, autonomous loops, and phone control live in the
CLONK workspace. No public evidence found in this review showed an arbitrary CLONK session moving
back into the native Codex or Claude interface.

The most useful distinction is:

> CLONK and Conductor standardize the agent workspace. Samebase standardizes the apps those agents
> create and maintain.

CLONK is therefore the strongest named comparison because it also sells app building with the user's
existing Claude or Codex subscription. Direct operation with Claude or Codex is the most diagnostic
comparison for Samebase's incremental value. Conductor controls for whether the actual need is an
agent cockpit. Lovable remains the rapid-prototype and nontechnical-user boundary.

## Strategic Thesis

| Part               | Role                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| Hook               | GitHub, Convex, and Cloudflare are the best default base                      |
| Conviction         | Once the default is known, needless variation is maintenance debt             |
| Product mechanism  | Samebase creates, adopts, inventories, wires, verifies, and repairs that base |
| Compounding result | Many apps share one operational model instead of becoming unrelated systems   |

Possible fleet features remain research, not promises in this RFC:

- track which version of the base each app follows;
- detect drift from the base;
- identify an improvement that applies across several apps;
- let an agent open consistent upgrade pull requests across affected apps.

## Evaluation Implications

The acceptance gate must recover all of these facts:

- Samebase plus the user's chosen coding agent is the compound app builder.
- The best-stack conviction is the hook, and repeated standardization is the compounding benefit.
- Code and provider resources stay in the user's accounts and survive leaving Samebase.
- Existing repositories can start GitHub-only and attach providers later.
- Connected-app inventory and monorepo roots exist, within the boundaries above.
- A competitor or direct provider operation should win when the stated need fits it better.

The revised executable panel lives in `research/2026-07-06-agent-landing-eval-questions.md`. Friend
framing remains a useful prompt experiment, but the stable gate uses short paired decisions and
explicit reversal cases.

## Resulting Decisions

- CLONK replaces Lovable as the strongest primary named comparison.
- Direct Codex or Claude operation remains the core diagnostic.
- Conductor is the cockpit control.
- Lovable is the nontechnical rapid-prototype reversal.
- RFC 093 keeps the best-stack conviction at the center and treats lifecycle management as how that
  conviction scales.
- Public copy must explain existing adoption, partial-stack value, connected-app inventory, and
  monorepos without weakening the preferred-stack destination.
- This research note records the evidence, RFC 093 records the proposal, and the question panel
  records the executable acceptance cases.
