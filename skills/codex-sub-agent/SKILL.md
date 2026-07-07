---
name: codex-sub-agent
description:
  Spawn the local OpenAI Codex CLI as a bounded sub-agent thread from another agent (typically
  Claude Code as orchestrator). Trigger when the user says "start a codex thread", "codex
  sub-agent", "ask codex", "codex review", "delegate this to codex", or wants parallel Codex
  workers, a second-model opinion, or a thread they can later open in the Codex TUI.
---

# Codex Sub Agent

Every `codex exec` run is a real persisted Codex thread. Capture its thread id, follow up with
`codex exec resume <thread-id>`, and the operator can open the same thread interactively with
`codex resume <thread-id>`. No MCP server or extra plugin is required for this repo's flows.

Binary first: invoke the Codex.app-bundled CLI explicitly —
`/Applications/Codex.app/Contents/Resources/codex` — because it self-updates with the app. The
`/opt/homebrew/bin/codex` cask symlink pins the install-time version and goes stale (0.133.0 vs the
app's 0.142.5 on 2026-07-07); Nicu confirmed the homebrew one is not the correct one. The command
blocks below write bare `codex` for readability.

Verified on codex-cli 0.133.0 and spot-checked on 0.142.5 (2026-07-07): the full flag surface used
here exists identically on both. After a Codex upgrade, re-check flags with `codex exec --help`
before trusting this file.

## Sandbox First

This machine's `~/.codex/config.toml` sets `sandbox_mode = "danger-full-access"` with
`approval_policy = "never"`, and `codex exec` never prompts — an exec call without an explicit
sandbox runs with full disk access. Always pass one:

- `--sandbox read-only` for research, reviews, and Q&A threads.
- `--sandbox workspace-write -C <worktree>` for implementation threads; writes stay inside the `-C`
  directory plus any `--add-dir`.
- Never pass `--dangerously-bypass-approvals-and-sandbox`.
- Network inside `workspace-write` is off by default and fails silently (`curl -s` returns empty
  output with exit 0). When the task genuinely needs network (`pnpm install`, `gh`), add
  `-c sandbox_workspace_write.network_access=true` and tell the thread network is on.
- `codex exec resume` rejects `--sandbox` and `-C`: cwd comes from the session, but the sandbox
  falls back to `~/.codex/config.toml` (full access here). Always re-assert it with
  `-c sandbox_mode="..."` — verified: `-c sandbox_mode="read-only"` on a resumed thread blocked file
  writes.

## Spawn A Thread

```bash
codex exec --sandbox read-only -C <dir> --json \
  -o <scratch>/codex-<intent>-last.md \
  '<self-contained task prompt>' \
  > <scratch>/codex-<intent>-events.jsonl 2> <scratch>/codex-<intent>-stderr.log </dev/null
```

- The first JSONL line is `{"type":"thread.started","thread_id":"<uuid>"}` — capture the id.
- The final answer is the `-o` file; the events JSONL is the debug trace (commands run, token
  usage). Read the `-o` file, not the event stream.
- `</dev/null` matters: `codex exec` reads stdin ("Reading additional input from stdin...") and can
  hang in harnesses that keep stdin open. For long prompts, invert it: pipe the prompt in and pass
  `-` as the prompt argument (`scripts/samebase-pr-connect.ts` uses this shape).
- Outside a git repo (scratch dirs), add `--skip-git-repo-check`. Never use `--ephemeral` — it
  disables session persistence and kills resume.
- From Claude Code, launch each thread as its own background Bash task: completion notifications
  replace polling, and parallel workers come for free. Read `-o` files as they land.

## Follow Up On The Same Thread

```bash
codex exec resume <thread-id> -c 'sandbox_mode="read-only"' --json \
  -o <scratch>/codex-<intent>-reply.md '<follow-up>' </dev/null
```

Prior context carries over (verified: a resumed thread recalled its earlier answer verbatim).
`--last` targets the newest session instead of an id; `--all` lifts its default cwd filtering.

## Operator Handoff And GUI Visibility

- The Codex desktop app sidebar never lists exec-spawned threads — it requests interactive-source
  threads only (cli/vscode), and exec rollouts are tagged `source: "exec"`. Absence there is by
  design; do not debug it.
- To show a spawned thread in the app, hand the operator a deep link:
  `open "codex://threads/<thread-id>"` (the app registers the `codex://` scheme).
- Terminal: `codex resume <thread-id>` opens the thread in the TUI; the picker and `--last` need
  `--include-non-interactive`. `codex fork` branches it.
- Live GUI following of local threads is phone-first by design: `codex remote-control start` pairs
  the ChatGPT mobile app (GA since CLI 0.142.0 — another reason to use the app-bundled binary).
  `codex cloud exec` plus chatgpt.com/codex is the zero-setup web fallback, at the cost of running
  in OpenAI's cloud instead of on this machine.
- Always report thread ids (and the `codex://threads/<id>` link) in the final response.

## Model, Effort, Cost

- Threads inherit `~/.codex/config.toml` defaults (currently `gpt-5.5` at `xhigh` effort — the
  expensive quality tier). For bounded sweeps, lower effort per thread with
  `-c model_reasoning_effort="medium"` (values: minimal, low, medium, high, xhigh); pin `-m <model>`
  only when the operator names one.
- Threads bill the operator's ChatGPT subscription and share its five-hour usage window, so parallel
  threads drain it faster. Default to 2-4 parallel workers; go wider only when asked.
- `--output-schema <schema.json>` forces a JSON final message when a fan-out needs machine-parseable
  results.

## Worktree Discipline

- One write thread per worktree; never two write threads in the same checkout. Read-only threads can
  share anything.
- In-repo threads auto-load `AGENTS.md`, so repo rules (including worktree bootstrap) apply inside
  the thread. Scope each thread like any sub-agent: narrow task, pass/fail criteria, and where to
  write results.

## Operational Notes

- Spawned threads load the operator's full Codex config, including external MCP servers; stale MCP
  auth prints `rmcp ... TokenRefreshFailed` errors on stderr without failing the run.
- Nonzero exit: read the tail of the events JSONL, not just stderr.
- Auth check: `codex login status` should print "Logged in using ChatGPT". If it does not, ask the
  operator to run `codex login`; never print tokens.
- `-c` values parse as TOML, so keep the quotes: `-c model_reasoning_effort="medium"`.
- Sessions persist under `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`. Rollouts are internal
  artifacts; never commit them to a repo.
- The official [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) plugin
  (`/codex:review`, `/codex:rescue`) is fine for interactive delegation, but source-verified: it
  drives the app-server protocol, its reviews run `ephemeral: true` (no thread persisted, nothing to
  resume), and none of its jobs appear in any GUI — status is text-only. For operator-visible,
  resumable threads, prefer this skill's `codex exec` shape.
