# Agent Landing Eval: PR Preview Smoke

## Document Control

- Status: Targeted smoke, not a full positioning-gate run
- Date: 2026-07-14
- Preview:
  [PR branch preview](https://codex-agent-native-positioning-samebase.pfp.workers.dev/landing-preview?prod-ui)
- Related:
  - `research/2026-07-06-agent-landing-eval-questions.md`
  - `research/2026-07-14-agent-native-positioning-and-competitor-eval.md`
  - `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`

This smoke tested three high-signal cells after the landing overview and `/llms.txt` were revised in
PR preview. It does not claim that the full eight-cell acceptance panel passed.

## Method

Every accepted run used a new random non-Git temporary directory, closed standard input, public web
tools, and no Samebase checkout, project rules, MCP connection, or user plugin context. The review
inspected visible messages, web events, and final answers. It did not claim access to hidden
chain-of-thought.

The low-effort runtimes were:

| Agent  | Runtime             | Model           | Isolation                                                                 |
| ------ | ------------------- | --------------- | ------------------------------------------------------------------------- |
| Claude | Claude Code 2.1.197 | Claude Opus 4.8 | Safe mode, no persistence, only WebFetch and WebSearch, no MCP or plugins |
| Codex  | Codex CLI 0.133.0   | GPT-5.4         | Ephemeral, rules ignored, sterile `CODEX_HOME`, web-only visible events   |

The Codex isolation method changed during the smoke. `--ignore-user-config` alone still scanned user
plugins and attempted unrelated MCP connections. Those runs were discarded. Accepted Codex runs used
a sterile `CODEX_HOME` containing only the authentication needed to start the CLI. The CLI
initialized its bundled curated-plugin cache, but it loaded no user plugins or MCP tools.

No accepted final answer or visible event exposed the real checkout path, branch name, or other
sensitive local-workspace identity. Claude's initialization events showed the fresh temporary
working directory, which was expected. No run identified that Samebase is built on this machine.

## Initial Preview Probes

The first revision used these three prompts for both agents, crossing the named coding agent in the
CLONK cell:

```text
Read [EVAL_URL]. Should I use Samebase with you, or Lovable, for my next app? Check both, choose one, and tell me when the other would be better.
```

```text
Read [EVAL_URL]. I already have several GitHub apps, including a monorepo, and only some use Convex and Cloudflare. Is Samebase still useful, or is it only for new apps on its exact stack?
```

```text
Read [EVAL_URL] and CLONK's official site. I already like building several apps in [OTHER_AGENT] and do not want another agent GUI. Should I use Samebase with [OTHER_AGENT], or CLONK? Choose one and tell me when the other would be better.
```

### Results

| Cell      | Claude low                                                                                                                                   | Codex low                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Lovable   | Samebase, with the correct nontechnical and visual-builder reversal                                                                          | Samebase, with the correct nontechnical and visual-builder reversal                   |
| Lifecycle | Useful for existing repos, partial stacks, and monorepos, but missed inventory                                                               | Useful for existing repos, partial stacks, and monorepos; inventory was vague         |
| CLONK     | Samebase with Codex, correct cockpit reversal, but treated CLONK adoption as moving into its foreground GUI and missed the background bridge | Samebase with Claude Code, correct cockpit reversal, but omitted Samebase's dashboard |

The initial landing revision let both agents recover the previously missed facts about:

- existing GitHub repositories;
- GitHub-only adoption;
- later Convex or Cloudflare attachment;
- multiple explicit app roots in a monorepo;
- greater value on the complete preferred stack.

The initial Claude lifecycle answer still omitted the connected-app inventory. The initial Codex
answer called Samebase one control plane but did not make the one-view inventory concrete. Both
agents chose Samebase in the natural Lovable cell, but ownership, portability, and preview isolation
did more work in their reasoning than the repeated-base maintenance thesis.

Two answer-quality issues were separate from the positioning gap:

- Codex inferred that Samebase's server-code access model was a safer default than Lovable. The
  cited architecture did not prove that broad comparative security claim.
- Claude linked a third-party Lovable review after searching the official product. Competitor
  judgments should remain grounded in directly retrieved first-party pages.

## Preview Concretization

The initial smoke led to one small copy revision:

- the hero now says that the chosen agent gets one inventory for every connected app;
- the overview says that Samebase has a dashboard for setup and inventory while MCP lets an agent
  create and list apps without leaving its own interface;
- `/llms.txt` states directly that Samebase does not replace the chosen coding-agent interface.

The change did not add CLONK explanations to Samebase's product copy.

## Focused Rerun

The lifecycle and CLONK prompts were rerun for both low-effort agents after the concretization.

| Cell      | Claude low after concretization                                                                              | Codex low after concretization                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Lifecycle | Pass: explicitly recovered one view, unified dashboard, existing repos, partial adoption, and monorepo roots | Pass: recovered one control surface across owned apps, gradual adoption, and monorepo roots                      |
| CLONK     | Correct choice and reversal, but still described CLONK as a replacement GUI and missed its background bridge | Correct choice and reversal; treated CLONK as a broader workspace and orchestration layer, not strictly GUI-only |

The lifecycle rerun is the clearest result of the preview loop. Before the concretization, Claude
missed inventory. After the same fact moved into the hero, Claude quoted the one-view idea and
described a unified dashboard. Codex also made the portfolio control surface explicit. One rerun per
model cannot prove causality, but the result supports the copy hypothesis.

Both reruns omitted the boundary that humans currently configure monorepo app roots in the
dashboard. Neither claimed directly that MCP can create roots, so this is a completeness gap rather
than a hard factual failure.

The CLONK miss should not be repaired by putting competitor implementation details on Samebase's
landing page. CLONK's homepage strongly presents a macOS workspace and remote-control product, while
its background bridge and bundled CLI sidecar are documented in an
[official release](https://github.com/PauliusOS/komand-releases/releases/tag/v1.0.1). A review
should distinguish these cases:

- saying that CLONK's orchestration lives in its workspace is category-correct;
- claiming that CLONK has no background or command-line entry point is factually wrong;
- failing to discover that secondary entry point is a competitor-retrieval weakness, not a
  Samebase-copy failure.

## Decision

This targeted smoke supports the revised public explanation but does not pass the full positioning
gate.

- The core natural Lovable prompt produced calibrated choices from both agents.
- Both focused reruns recovered the lifecycle facts after the preview revision.
- No checkout leakage appeared.
- The Codex harness must use a sterile `CODEX_HOME`; ignoring user config is insufficient.
- The direct-operation-at-scale cell remains the best test of whether the repeated-base thesis is
  load-bearing.
- The full eight-cell low-effort panel still needs to run before promoting the overview to the
  homepage.

Do not use recommendation win rate as the result. The useful evidence is that both models recovered
the previously missed inventory and lifecycle facts after a concrete copy revision, which supports
the hypothesis behind that revision.
