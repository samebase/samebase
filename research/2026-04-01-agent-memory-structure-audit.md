# Agent Memory Structure Audit

Date: 2026-04-01

## Why This Document Exists

This audit answers a practical repo-maintenance question:

1. What should live in `AGENTS.md` versus `specs/`, `rfcs/`, `research/`, `docs/`, `skills/`, and
   `archive/`?
2. Which repeated pain points from recent threads and merged PRs should shape that split?

The goal is not to dump more memory into one file. The goal is to make the repo easier for agents to
navigate and harder for repeated mistakes to survive.

## Method

This audit used four inputs:

1. Current repo structure and the contents of `AGENTS.md`
2. Recent merged PRs on `main`, especially UI-regression and workflow PRs such as `#404`, `#402`,
   `#397`, `#392`, `#391`, `#390`, and `#385`
3. Recent local Codex thread history via the repo's existing local-control runtime
4. Current public guidance on agent context files, repo knowledge structure, skills, and subagents

## External Guidance

Current public guidance converges on the same pattern:

- Keep the always-loaded repo instruction file short and stable.
- Use repository-local versioned artifacts as the real knowledge base.
- Use progressive disclosure: start with a small map and load deeper material on demand.
- Move deterministic requirements into hooks, CI, or scripts when possible.
- Use skills for reusable conditional workflows, not for repo-wide invariants.
- Use subagents for bounded specialist work, not as a replacement for repo documentation.

Useful references:

- OpenAI,
  ["Harness engineering: leveraging Codex in an agent-first world"](https://openai.com/index/harness-engineering/)
- OpenAI,
  ["How OpenAI uses Codex"](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- Anthropic, ["Skills overview"](https://claude.com/docs/skills/overview)
- Anthropic, ["Create custom subagents"](https://code.claude.com/docs/en/subagents)
- ArXiv,
  ["Agent READMEs: An Empirical Study of Context Files for Agentic Coding"](https://arxiv.org/abs/2511.12884)

One honesty note: the strongest public "skills" guidance today is still more explicit in Anthropic's
docs than in public OpenAI Codex docs, so the skills recommendations below are partly an inference
from those official docs plus the cross-tool pattern they describe.

## Findings

### 1. `AGENTS.md` had become a mixed bag

Before this cleanup, `AGENTS.md` mixed together:

- broad repo invariants
- current architecture notes
- stale capability snapshots
- TODO backlog items
- deep git/PR workflow playbooks
- operator preferences
- unrelated reference links

That shape makes the most important rules easier to miss, and it encourages people to keep adding
more to the same file because there is no better home.

### 2. The repo already had a de facto information hierarchy

Recent merged PRs and accepted docs already show a consistent pattern:

- accepted decisions become `specs/`
- rollout plans and proposals live in `rfcs/`
- PRs carry `Why`, `Summary`, and `Validation`
- research branches often start with documentation before code

What was missing was an explicit place for exploratory audits and investigations that are useful but
not yet proposals. That gap encouraged documents to land in `docs/research/` or inside `AGENTS.md`.

### 3. Repeated UI bugs were exposing the same testing/process issue

Recent PRs and threads repeatedly converged on the same lesson:

- route-shell, scroll, drag, and layout bugs need real-route Playwright repros
- fake fixtures drift and hide real bugs
- honest production-component fixtures are acceptable only when they do not invent layout

That is a repeatable workflow and belongs in a skill plus a short repo rule, not as a buried one-off
correction in chat.

### 4. The strongest recurring repo habit is research-first, then narrow

implementation

Recent merged PRs repeatedly start with research, an RFC/spec, or a clear PR `Why` section before
landing the smallest viable implementation slice. That is a strength and should be reflected in the
folder structure.

### 5. Some important guardrails were missing

The earlier `AGENTS.md` was strong on coding style and workflow, but lighter on security,
performance, and accessibility guardrails. Shared-shell and editor changes need those constraints
called out explicitly.

## Recommended Structure

### `AGENTS.md`

Keep only:

- startup and bootstrap rules
- repo folder map and authority order
- short architecture summary
- broad code, UI, and workflow guardrails
- a small set of durable operator preferences
- pointers to deeper docs and skills

Do not keep:

- stale capability snapshots
- TODO backlogs
- long review/ship playbooks
- historical notes
- unrelated reference links

### `specs/`

Accepted current truth. Use when a document should answer "what do we do now?"

### `rfcs/`

Concrete proposals and rollout plans that still need acceptance or are not yet the current contract.

### `research/`

Exploration, audits, benchmarks, postmortems, and external research. Useful evidence, not normative
behavior.

### `docs/`

Reference material such as workflow runbooks and compliance docs that should be versioned in the
repo but do not define product behavior.

### `skills/`

Reusable conditional workflows such as:

- route-first Playwright validation
- PR creation/update
- macOS app control

### `archive/`

Historical material that should no longer guide active implementation.

## Recommended Changes In This Patch

1. Shrink `AGENTS.md` into a repo map plus durable guardrails.
2. Create a top-level `research/` folder and move existing research memos there.
3. Add folder `README.md` files so the document taxonomy is explicit.
4. Move deep workflow detail into `docs/agent-workflows.md`.
5. Tighten existing skills so repeated workflows live there instead of bloating `AGENTS.md`.

## Follow-Up Ideas

These are good next steps, but they are intentionally not part of this patch:

1. Add a lightweight PR checklist item for route-level UI repros.
2. Add targeted automation or CI for high-value doc hygiene once the taxonomy is stable.
3. Periodically audit stale RFCs and research docs and move dead material to `archive/`.
