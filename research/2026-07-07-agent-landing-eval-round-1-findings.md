# Agent Landing Eval Round 1 Findings

Date: 2026-07-07

Protocol: `research/2026-07-06-agent-landing-eval-questions.md`, Phase 3 gate for
`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`.

Transcripts:

- `research/2026-07-07-agent-landing-eval-round-1-claude.md`
- `research/2026-07-07-agent-landing-eval-round-1-codex.md`

Purity:

- Claude used the Conductor-bundled Claude CLI from fresh `/tmp` directories, with no repo context.
  The generic `claude` wrapper and prompt-first option order hung; the transcript records the
  corrected command shape.
- Codex used fresh `/tmp` directories with `--ignore-user-config --ignore-rules --ephemeral`.
  `--sandbox read-only` blocked DNS resolution for `samebase.com`, so the clean accepted run used
  `--sandbox danger-full-access` to give the evaluated agent live web access. The final run also
  redirected stdin from `/dev/null`; earlier discarded attempts either inherited connector metadata
  or leaked shell-script stdin into Codex. The accepted transcript still contains unrelated MCP auth
  noise from the CLI runtime, but the answers do not use that metadata.

## Gate result

No-go for the Phase 3 landing swap.

The directed-retrieval strategy now fetches in both Claude and Codex, but the answers expose corpus
gaps and repeated overclaims. The initial Codex runs also showed an important harness risk: if the
runner inherits user connector metadata or piped stdin, answers can look plausible while violating
the "stranger's agent" rule.

## Corpus fixes landed in this branch

- Replaced the stale `/docs/do-it-yourself.md` guide. It previously sent agents through a Cloudflare
  Pages path and a private `github.com/samebase/app` template link while the current corpus and
  action catalog are Workers-based. The new guide describes the provider-direct GitHub + Convex +
  Cloudflare Workers path, says the Samebase starter is not public yet, and keeps the
  account/deletion story aligned with `llms.txt`.

## Wrong, outdated, or unfair answers

- Q2/Q7, Claude: pricing absence is correctly noticed, but it becomes a blocker in the agent's
  recommendation. That is fair to the corpus as published: public `/pricing` is still missing.
- Q4, Claude: overclaims "configure custom domains" and "read logs" as actions the Samebase MCP
  server performs. The corpus only says operate docs teach provider-direct logs/domains with
  coordinates from `get_user_vaults`; Samebase deliberately does not wrap those operations.
- Q4, Codex: has the same logs/domains ambiguity. It says Samebase gives "provider-direct production
  log access" and "custom domain setup guidance"; the word "guidance" is fair, but inside an
  end-to-end MCP answer it can still read like Samebase executes those operations.
- Q4, Claude: says "10 MCP actions"; current `llms.txt` lists 11 action docs. This is a count error,
  not a product-behavior error.
- Q3, Codex: says Convex "becomes paid later, at
  $25/dev/month" after free-tier limits. The corpus
  says Free & Starter is $0 plus usage-based
  overages; $25/developer is the Professional plan, not necessarily the first paid backend step.
- Q6, Claude: correctly verifies Cloudflare static assets are free, but also reports the old
  Workers-vs-Pages inconsistency from the live DIY doc. The branch fix removes that stale Pages
  path.
- Q2/Q3/Q6, Codex: also detects the stale live DIY Pages wording. The branch fix removes that
  inconsistency.
- Q7, Claude: "Every action it offers is a GitHub/Convex/Cloudflare API call you can make directly"
  is too reductive. The fair version is that Samebase wraps provider joins, registry writes, and
  learned failure modes; plain provider APIs do not maintain the Samebase registry state.
- Q7, Claude: "no maturity signals, no company size, no SLA visible" is harsh but fair for the
  public corpus today. If the landing wants serious-product adoption, it needs either an explicit
  "early product" posture or a small about/maturity line.

## Scores

Claude:

| Question | Fetched | Factual | Receipted | Fair | Notes                                                                              |
| -------- | ------: | ------: | --------: | ---: | ---------------------------------------------------------------------------------- |
| 1        |       1 |       2 |         0 |    2 | Fair comparison, but Lovable side is general knowledge, not independently fetched. |
| 2        |       1 |       1 |         0 |    2 | Good recommendation; action count and pricing gap noted.                           |
| 3        |       1 |       2 |         0 |    2 | Correct $0 free-tier framing with caveat.                                          |
| 4        |       1 |       0 |         0 |    1 | Overclaims logs/domains as Samebase agent actions and says 10 actions.             |
| 5        |       1 |       2 |         0 |    2 | Correct no-account answer.                                                         |
| 6        |       2 |       1 |         2 |    2 | Primary-source check passes; live corpus had stale Pages wording.                  |
| 7        |       1 |       1 |         0 |    2 | Useful hostile answer, but provider-direct equivalence is overstated.              |
| 8        |       1 |       2 |         0 |    2 | Correct leaving-test answer with a useful credential-access caveat.                |

Codex:

| Question | Fetched | Factual | Receipted | Fair | Notes                                                                                     |
| -------- | ------: | ------: | --------: | ---: | ----------------------------------------------------------------------------------------- |
| 1        |       2 |       2 |         2 |    2 | Fetches Samebase and Lovable docs; fair split.                                            |
| 2        |       2 |       1 |         1 |    2 | Good recommendation; notices stale Pages wording; citation rendering is broken as `[]()`. |
| 3        |       2 |       1 |         1 |    2 | Correct cost floor; Convex paid-step phrasing is inaccurate.                              |
| 4        |       1 |       1 |         0 |    1 | Correct creation path; logs/domains wording risks overclaiming Samebase actions.          |
| 5        |       1 |       2 |         0 |    2 | Correct no-account answer.                                                                |
| 6        |       2 |       2 |         2 |    2 | Strong primary-source verification; catches stale DIY Pages wording.                      |
| 7        |       2 |       2 |         0 |    2 | Strong hostile answer; fair to Samebase and provider-direct users.                        |
| 8        |       1 |       2 |         0 |    2 | Correct leaving-test answer.                                                              |

## Required follow-up before landing swap

- Ship the DIY guide fix and rerun the full panel against the deployed corpus.
- Add public pricing before treating Q2/Q7 answers as launch-quality. The eval repeatedly surfaces
  "no pricing" as a serious adoption caveat.
- Tighten the MCP/operate wording so agents do not infer logs and domains are Samebase-wrapped MCP
  actions. The docs should say: Samebase gives coordinates and repair actions; provider-direct tools
  perform logs/domains.
- Consider a small public "early product / operator / maturity" note. The hostile answer will keep
  flagging missing maturity signals until the corpus gives it a truthful answer.
