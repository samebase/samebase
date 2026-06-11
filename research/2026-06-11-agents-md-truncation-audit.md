# AGENTS.md Truncation Audit And Restructure (2026-06-11)

Status: implemented (see the restructure PR this document landed in) Method: 8-agent fact-check of
every checkable AGENTS.md claim, git size archaeology, mining of 1,558 local noter Codex session
rollouts, live `codex exec` probes, and external best-practice research. This file is the durable
record behind the AGENTS.md restructure, the `scripts/check-agents-doc-budget.ts` guard, and
`scripts/pr-build-label.ts`.

## The core finding

OpenAI Codex truncates combined project docs (root `AGENTS.md` plus nested ones) at
`project_doc_max_bytes` = 32,768 bytes by default and silently drops everything past the cap.
`AGENTS.md` crossed that cap twice:

| Date       | Commit                          | Event                                                      | Size     |
| ---------- | ------------------------------- | ---------------------------------------------------------- | -------- |
| 2026-03-19 | `7829565ab`                     | First crossing ("Document clickable PR number preference") | 32,809 B |
| 2026-04-02 | `dca058415`                     | Operator reorganization dropped it back under              | 12,675 B |
| 2026-05-21 | `b98ecc728`                     | Second crossing                                            | 35,475 B |
| 2026-06-11 | working tree before restructure | still growing                                              | 44,015 B |

The 32 KiB line fell at ~line 462 of 629, hiding: the second half of Workflow Rules (including every
`v<N>` PR-label rule, lines ~481-518), Worktree Rules, all Operator Preferences, and Task-Specific
References.

## Session evidence (causally tight)

Codex rollouts record the injected `AGENTS.md` verbatim, so per-session truncation is directly
measurable; it caps at exactly 32,768 doc bytes, cut mid-sentence.

- `## Operator Preferences` was visible in 44/54 sessions on May 28, 8/59 on May 29, 0 from May 30
  on.
- The "Prefix every PR title" rule was visible in 25/47 sessions on Jun 6, 1/43 on Jun 8, 0/59 on
  Jun 9 (sections above it grew, pushing it past the cap).
- Zero missing-label complaints May 10 - Jun 7 while the rule was visible; three operator
  corrections Jun 8-10, and each of those sessions' injected docs verifiably end before the label
  rules.
- Pre-restructure `codex exec` probe (reasoning effort xhigh): correctly answered a Startup question
  (early in file), could quote only the vague shortcut-table mention of `v<N>:`, and answered "NOT
  IN MY CONTEXT" for the Operator Preferences response requirement.
- The label protocol also failed twice while fully visible (Apr 25, May 9: stale label after rebase,
  squash-subject confusion) — the protocol itself was error-prone, which is why it is now a script
  (`scripts/pr-build-label.ts`), not only prose.
- Cautionary precedent: the Apr 2 aggressive trim changed agent behavior in ways the operator
  disliked within days ("after the latest changes to how we organize our agents.md, I think some
  things changed in your behavior"). Restructures must relocate, not delete.

## External best practice (sources verified 2026-06-11)

- Codex caps combined project docs at 32 KiB by default and recommends nested per-package AGENTS.md
  files (developers.openai.com/codex/guides/agents-md).
- Instruction-following quality degrades roughly uniformly across ALL instructions as instruction
  count grows; keep always-loaded files small (humanlayer.dev/blog/writing-a-good-claude-md,
  philschmid.de/writing-good-agents).
- Executable commands beat prose: tools mentioned in agent files get used far more than unmentioned
  ones; exact commands in an early section are the highest-ROI content (github.blog "lessons from
  2,500 repositories").
- Progressive disclosure: keep a small always-loaded core that routes to docs/skills read on demand
  (agents.md, Cursor rules docs, Copilot custom-instructions docs).
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`; `@AGENTS.md` import gives both tools one source of
  truth (code.claude.com/docs/en/memory.md). Before this change, Claude Code sessions loaded none of
  AGENTS.md.

## What changed

1. `AGENTS.md` restructured from 44,015 B / 629 lines to ~28.3 KB, ordered by pain: Startup,
   Workflow Shortcuts, Workflow Rules core, Worktree Rules, Operator Preferences, then guardrails
   and references. Nothing was deleted; relocated content kept a pointer:
   - Workflow Rules detail → `docs/agent-workflows.md` (already covered most of it; the gaps —
     branch renaming, rebase+push, `update PR`, phase labels — were added there first).
   - Code Guardrails → one-line index in AGENTS.md; canonical full wording in
     `docs/code-guardrails.md`.
   - Convex production-read recipe → `docs/convex-production-reads.md`.
   - Playwright operator preferences and baseline mechanics →
     `skills/noter-playwright-live/SKILL.md`.
2. `scripts/pr-build-label.ts` — computes the projected `v<N>` label from the `origin/main` commit
   count and rewrites the current PR title in place (`--print-only` to preview).
3. `scripts/check-agents-doc-budget.ts` — wired into `check:scripts`; fails past 31,000 combined
   bytes, warns past 29,500 (regrowth since this restructure), and warns on AGENTS.md references to
   missing paths.
4. Root `CLAUDE.md` now imports `@AGENTS.md` so Claude Code loads the same rules as Codex.
5. Operator-machine belt-and-suspenders: `project_doc_max_bytes = 65536` set in
   `~/.codex/config.toml` (local only; the repo budget guard protects every other environment).

## Follow-ups deliberately not done here

- Deeper slimming toward the ~300-line ideal once `packages/agent-context` routing is wired into a
  real runtime (see `research/2026-05-23-agent-context-agents-migration-map.md`); this pass
  optimized for zero rule loss.
- RFC 063 (shadcn wrapper entrypoints) is still Proposed; the AGENTS.md shadcn pointer stays until
  it is accepted or rejected.
- `@prosemark/core` is pinned at ^0.0.7 (latest 0.0.9); bump and retest to retire the "temporary
  ProseMark workaround" rule.
- The summary/canonical split for Code Guardrails can drift; reviewers of guardrail changes should
  update `docs/code-guardrails.md` and the AGENTS.md index line together.
