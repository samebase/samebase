# Agent Landing Eval: Question Panel

Part of `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md` Phase 1 ("marketing as CI"). The landing strategy
hands a short prompt and a URL to a coding agent, so its correctness is testable. Run this panel
against a deployed preview before promoting positioning changes to the homepage, and after any
meaningful corpus change.

## How To Run A Round

- Set `[EVAL_URL]` to the exact public page under evaluation. For a PR, use its preview origin and
  `?prod-ui`; do not mix a preview overview with production `/llms.txt`.
- Run fresh `claude -p` and `codex exec` sessions with web access enabled, one prompt per session.
- Start every session in a new random, non-Git temporary directory. Close standard input and do not
  inherit repository instructions, Samebase MCP connections, or project plugins.
- Give the session exactly one prompt below. Substitute only `[EVAL_URL]` and `[OTHER_AGENT]` where
  required.
- Run both agents at low effort first. A higher-effort rerun diagnoses a failure but does not erase
  the low-effort result.
- Record model family, effort, exact prompt, URLs fetched, decision, load-bearing reasons, and any
  factual errors. Save sanitized findings in `research/<date>-agent-landing-eval-round-<n>.md`.
- Inspect visible messages, web and tool events, and the final answer. Do not claim access to hidden
  chain-of-thought. Encrypted or empty thinking fields are not evidence.

No prompt should tell an agent that Samebase is the current repository or is built on the same
machine. A run fails if it discovers that fact from inherited local context.

## Positioning Acceptance Panel

### 1. Compound Builder Versus Lovable

```text
Read [EVAL_URL]. Should I use Samebase with you, or Lovable, for my next app? Check both, choose one, and tell me when the other would be better.
```

Expected: no fixed vendor. The answer must state its assumption and reconstruct both categories
accurately. Samebase should win for a maintained code-owned app with the current agent; Lovable
should win for a nontechnical or visual prompt-to-prototype workflow.

### 2. Lovable Reversal

```text
Read [EVAL_URL] and Lovable's official site. I am nontechnical and want to ship a weekend prototype without managing GitHub or infrastructure. Should I use Samebase with you, or Lovable?
```

Expected: Lovable. The stated need is its integrated nontechnical prompt-to-app workflow.

### 3. Direct Operation At Scale

```text
Read [EVAL_URL]. I want to build and maintain several SaaS apps with you. Should I use Samebase, or should you manage GitHub, Convex, and Cloudflare directly for each app? Choose one and tell me when the other would be better.
```

Expected: Samebase. The answer must identify one repeated base and lower maintenance across several
apps, not merely faster initial provisioning.

### 4. Direct Operation Reversal

```text
Read [EVAL_URL]. I have one healthy GitHub, Convex, and Cloudflare app, I am comfortable operating each provider directly, and I do not want another dashboard. Should I add Samebase?
```

Expected: direct provider tools. One healthy app without an inventory or repair need does not prove
incremental Samebase value.

### 5. CLONK Native-Interface Case

```text
Read [EVAL_URL] and CLONK's official site. I already like building several apps in [OTHER_AGENT] and do not want another agent GUI. Should I use Samebase with [OTHER_AGENT], or CLONK? Choose one and tell me when the other would be better.
```

Set `[OTHER_AGENT]` to Codex for Claude runs and Claude Code for Codex runs.

Expected: Samebase. The answer must distinguish an app-base layer that works through MCP from
CLONK's own agent workspace. It must not claim that CLONK is strictly GUI-only.

### 6. CLONK Cockpit Reversal

```text
Read [EVAL_URL] and CLONK's official site. I want one workspace for Claude, Codex, terminals, previews, parallel work, and phone control. Should I use Samebase or CLONK?
```

Expected: CLONK. The requested value is an agent cockpit and remote-control layer.

### 7. Conductor Control

```text
Read [EVAL_URL] and Conductor's official site. I mainly need parallel agent sessions, worktrees, diffs, checks, and pull-request review in one desktop workspace. Should I use Samebase or Conductor?
```

Expected: Conductor. The requested value is workspace orchestration, not app-base standardization.

### 8. Lifecycle Reconstruction

```text
Read [EVAL_URL]. I already have several GitHub apps, including a monorepo, and only some use Convex and Cloudflare. Is Samebase still useful, or is it only for new apps on its exact stack?
```

Expected: useful for existing repositories, GitHub-only adoption, later Convex and Cloudflare
attachment, connected-app inventory, and multiple monorepo app roots. The answer must also say that
the complete preferred stack provides the most value.

## Claims Regression Panel

These questions protect important factual claims but do not define the positioning acceptance gate:

1. Do I need a Samebase account to use the stack they recommend?
2. Is it true that Cloudflare Workers serves static assets for free? Check Samebase's claims about
   hosting costs.
3. Why should I NOT use Samebase? (hostile question, permanent panel member)
4. If Samebase shuts down tomorrow, what happens to my app?

## Rubric (Per Transcript, 0-2 Each)

- Retrieval: fetched `[EVAL_URL]` and an official competitor source where required.
- Reconstruction: recovered the best-stack conviction, repeated standardization, and multi-app
  maintenance benefit.
- Factual accuracy: made no invented claims about Samebase, its stack, or the competitor.
- Category accuracy: distinguished app and infrastructure standardization from agent-workspace
  orchestration.
- Decision calibration: followed the user's stated constraints and reversed when appropriate.
- Fairness: explained when the other option is better.

The positioning gate passes only when both low-effort agents:

- make the expected choice in every decision cell that names one;
- calibrate the natural Lovable prompt from explicit assumptions and recover every expected fact in
  the lifecycle reconstruction cell;
- score 2 for factual accuracy, category accuracy, and decision calibration in every cell;
- score at least 1 on every other dimension; and
- have no hard failure.

### Hard Failures

- Local-checkout leakage.
- Claiming Samebase automatically discovers every app in a GitHub account.
- Claiming Samebase manages arbitrary provider infrastructure.
- Claiming an agent can already create or configure monorepo app roots through MCP.
- A Samebase recommendation that contradicts the stated scenario.
- A correct recommendation based on an incorrect product model.
- Skipping the supplied evaluation URL.

## Prompt Experiments

Friend framing is useful for checking vendor skepticism, but it is not part of the stable gate. Use
a reachable preview and say that it is not yet the homepage rather than saying it is unpublished:

```text
My friend is building Samebase and sent me the new landing page before he makes it the homepage: [EVAL_URL]. He says using Samebase with a coding agent like you is a better way to build my next app than CLONK. I'm skeptical because several people I trust recommend CLONK. Check both and tell me what you'd actually choose. Also tell me when the other is better.
```

Other controlled dimensions can rotate without making one enormous prompt:

- Samebase with the current agent versus Samebase with the other agent.
- Lovable, CLONK, Conductor, a rotating competitor from the recurring watch, or direct operation.
- New app, one healthy app, several apps, a partial stack, or a monorepo.
- Neutral, friend, skeptical, or competitor-recommended framing.
- Low effort first, then a higher-effort diagnostic rerun.

Live mutation of production copy during an active run is not part of this harness. Use a new preview
deployment for each clarification, then rerun the same prompt against the new URL.

## Round Log

- 2026-07-07 round 1: `research/2026-07-07-agent-landing-eval-round-1-findings.md`,
  `research/2026-07-07-agent-landing-eval-round-1-claude.md`, and
  `research/2026-07-07-agent-landing-eval-round-1-codex.md`. Result: no-go for the old Phase 3
  landing swap; the corpus needed a corrected DIY Cloudflare path and public pricing.
- 2026-07-14 positioning probes:
  `research/2026-07-14-agent-native-positioning-and-competitor-eval.md`. Result: agents understood
  the broad stack and ownership story but consistently missed existing-repository, GitHub-only,
  inventory, and monorepo value. The landing overview and `/llms.txt` need a preview revision before
  the next acceptance run.
