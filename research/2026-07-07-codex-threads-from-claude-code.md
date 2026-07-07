# Codex Threads From Claude Code

- Status: Research
- Date: 2026-07-07
- Outcome: `skills/codex-sub-agent/SKILL.md` (shipped with this doc) plus an optional
  operator-installed official plugin

## Question

Start actual OpenAI Codex CLI threads from inside Claude Code (and from repo scripts) — real
persisted sessions that support follow-up turns and can later be opened interactively in the Codex
TUI — without every new thread re-deriving the mechanics. Prefer adopting existing skills/setups
over inventing one.

## Answer

Three layers, in order of usefulness for this repo:

1. **Baseline (shipped): shell out to `codex exec`.** Every `codex exec` run already is a persisted,
   resumable thread. No bridge, server, or plugin is needed. The mechanics, safety rules, and
   verified flag surface live in `skills/codex-sub-agent/SKILL.md`, mirroring the existing
   `skills/claude-sub-agent/SKILL.md` (the same pattern in the opposite direction).
2. **Interactive layer (recommended, operator-installed): the official OpenAI plugin for Claude
   Code**, [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (~26.5k stars, pushed
   2026-06-23). Adds `/codex:review`, `/codex:adversarial-review`, `/codex:rescue` (background
   delegation with `--resume`, `--model`, `--effort`), `/codex:status` / `/codex:result` /
   `/codex:cancel`, and `/codex:transfer` (exports the current Claude Code transcript into a
   persistent Codex thread). It drives the same local `codex` install and login, never passes
   `--dangerously-bypass-approvals-and-sandbox`, and its Stop-hook review gate is opt-in
   (`/codex:setup --enable-review-gate`). Claude Code's permission layer treats plugin installation
   as an operator decision, so install it from an interactive session:

   ```text
   /plugin marketplace add openai/codex-plugin-cc
   /plugin install codex@openai-codex
   /codex:setup
   ```

3. **Rejected: third-party MCP wrappers around Codex.** Superseded by the official plugin for
   interactive use and by plain `codex exec` for automation; several default to sandbox-bypass flags
   or have gone stale (details in the survey below).

## Local Verification (codex-cli 0.133.0, 2026-07-07)

All claims in the skill were verified against the installed CLI, not docs:

- Spawn: `codex exec --json -o <file> '<prompt>'` emits JSONL events; the first line is
  `{"type":"thread.started","thread_id":"<uuid>"}` and the final agent message lands in the `-o`
  file. A `read-only` smoke run returned `PONG` as instructed.
- Resume with context: `codex exec resume <thread-id> '<follow-up>'` re-opened the same thread
  (identical `thread_id` in events) and correctly answered what its previous reply had been.
  `codex exec resume --help` also documents `--last` and `--all` (cwd-filter lift). Resume rejects
  `-s/--sandbox` and `-C/--cd`: cwd comes from the session and the sandbox falls back to config. The
  `-c sandbox_mode=...` override does apply — resuming with `-c sandbox_mode="read-only"` blocked a
  file write ("operation not permitted").
- Operator handoff: `codex resume <thread-id>` opens a specific exec-spawned session in the TUI; the
  picker and `codex resume --last` hide non-interactive sessions unless `--include-non-interactive`
  is passed (shipped via [openai/codex#24503](https://github.com/openai/codex/pull/24503)).
  `codex fork` branches a persisted session.
- Sandbox network A/B: in `--sandbox workspace-write`, `curl -sI https://example.com` inside the
  thread produced empty output with exit 0 (network blocked, silent failure); the same run with
  `-c sandbox_workspace_write.network_access=true` returned `HTTP/2 200`.
- Config inheritance hazard: the operator's `~/.codex/config.toml` sets
  `sandbox_mode = "danger-full-access"` and `approval_policy = "never"`, so an exec call without an
  explicit `--sandbox` runs unsandboxed. The skill therefore mandates an explicit sandbox on every
  spawn.
- Stdin behavior: `codex exec` logs `Reading additional input from stdin...` when stdin is open;
  harnesses that hold stdin open hang the process, hence `</dev/null` (or piping the prompt with
  `-`) in the skill's command shapes.
- Flag drift: `codex exec --ask-for-approval never` no longer parses on 0.133.0 (clap exit 2).
  `scripts/samebase-pr-connect.ts` still passes it, so its Codex invocation is currently broken;
  flagged as a separate fix task rather than widening this change.
- MCP side noise: spawned threads load the operator's Codex config including external MCP servers; a
  stale MCP login printed `rmcp ... TokenRefreshFailed` on stderr without failing the run.

## Ecosystem Survey (2026-07-07)

Swept GitHub, plugin marketplaces, X, and blog write-ups for existing Claude-Code-drives-Codex
setups:

- [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) — official Claude Code plugin;
  slash commands + background jobs + resumable rescue threads + transcript transfer. The only
  actively maintained option with first-class thread management. **Adopted as the recommended
  interactive layer.**
- [skills-directory/skill-codex](https://github.com/skills-directory/skill-codex) — pure
  `codex exec` skill (~1.3k stars). Its
  [SKILL.md](https://github.com/skills-directory/skill-codex/blob/main/plugins/skill-codex/skills/codex/SKILL.md)
  encodes the stdin-hang and stderr-noise gotchas this repo's skill now also covers. **Pattern
  borrowed; not installed** (repo-specific sandbox/worktree rules needed anyway).
- [BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server) (renamed
  zen-mcp-server) — MCP server whose
  [`clink`](https://github.com/BeehiveInnovations/zen-mcp-server/blob/main/docs/tools/clink.md) tool
  spawns Codex with `--dangerously-bypass-approvals-and-sandbox` and supports `continuation_id`.
  Heavy dependency, ~7 months idle, unsafe defaults. Rejected.
- [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server) — best third-party MCP
  wrapper (named resumable sessions, `listSessions`), superseded by the official plugin. Rejected.
- [kky42/codex-as-mcp](https://github.com/kky42/codex-as-mcp) — `spawn_agents_parallel` fan-out but
  sandbox-bypass defaults and no resume. Rejected.
- [cexll/codex-mcp-server](https://github.com/cexll/codex-mcp-server) — streaming `codex exec` MCP
  wrapper; redundant here. Rejected.
- [shinpr/sub-agents-skills](https://github.com/shinpr/sub-agents-skills) — cross-CLI router skill
  (codex/claude/cursor/gemini personas), deliberately stateless ("every sub-agent starts fresh").
  Not a fit for resumable threads.
- Manager apps around (not inside) sessions:
  [claude-squad](https://github.com/smtg-ai/claude-squad),
  [vibe-kanban](https://github.com/BloopAI/vibe-kanban),
  [container-use](https://github.com/dagger/container-use). Different problem.
- Theo's (t3.gg) setup, per [his X thread](https://x.com/theo/status/2072481845363822914) and
  secondary write-ups: CLAUDE.md routing prose plus a thin wrapper agent running `codex exec` via
  Bash — the same shell-out pattern, never published as an installable artifact.
- Pattern write-ups that match the shipped skill:
  [madewithlove — Claude up front, Codex in the back](https://madewithlove.com/blog/claude-up-front-codex-in-the-back/),
  [amanhimself — headless Codex inside Claude Code](https://amanhimself.dev/blog/running-headless-codex-cli-inside-claude-code/),
  [danielraffel — bidirectional /codex + /claude skills](https://danielraffel.me/til/2026/02/03/how-i-got-claude-to-consult-codex-and-when-i-use-it/).

## Official Programmatic Surfaces Beyond `codex exec`

Verified against the 0.133.0 binary plus [official docs](https://developers.openai.com/codex)
(latest upstream is 0.142.5; every surface below already exists in 0.133.0):

- [Non-interactive mode](https://developers.openai.com/codex/noninteractive) — the `codex exec`
  contract used by the skill: JSONL event stream (`thread.started` / `item.completed` items such as
  `agent_message`, `command_execution`, `file_change`, `mcp_tool_call` / `turn.completed` with token
  usage, plus `turn.failed` and `error`), `--output-schema`, and resume semantics ("original
  transcript, plan history, and approvals" retained).
- [Codex as MCP server](https://developers.openai.com/codex/guides/agents-sdk) — `codex mcp-server`
  (stdio; not `codex mcp`, which manages Codex's own external servers). Verified via a live
  `tools/list` handshake: tools `codex` (args include `prompt`, `sandbox`, `approval-policy`, `cwd`,
  `model`, `config`) and `codex-reply` (`prompt` + `threadId`; `conversationId` is a deprecated
  alias). A tool call spans the whole Codex turn, so long runs need a raised MCP timeout (OpenAI's
  own Agents SDK example sets `client_session_timeout_seconds=360000`; Claude Code equivalents are a
  per-server `timeout` in `.mcp.json` or `MCP_TOOL_TIMEOUT` per
  [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)).
- [Codex SDK](https://developers.openai.com/codex/sdk) — TypeScript `@openai/codex-sdk` with
  `startThread()` / `resumeThread(threadId)` / `thread.run(prompt)`; the natural upgrade path if a
  repo script ever outgrows shelling out.
- [App server](https://developers.openai.com/codex/app-server) — experimental JSON-RPC surface
  (`thread/start`, `thread/resume`, `turn/start`, `turn/steer`); what the desktop app and the
  official plugin build on.
- [Codex Cloud CLI](https://developers.openai.com/codex/cli/reference) — `codex cloud exec` and
  friends, all experimental; remote tasks rather than local threads.
- [Native subagents](https://developers.openai.com/codex/subagents) — Codex can fan out its own
  parallel subagents inside a thread, so a spawned worker can itself parallelize.
- [Rate limits](https://developers.openai.com/codex/pricing) — local messages and cloud tasks share
  a five-hour usage window (plus weekly caps) on ChatGPT-plan auth; no documented cap on concurrent
  `codex exec` processes — parallel threads just drain the shared pool faster.

## Why Shell-Out Beats An MCP Bridge Here

- Claude Code background Bash tasks already provide parallel workers, completion notifications, and
  on-disk artifacts (`-o` files, event JSONL) — an MCP bridge re-implements that behind a long-lived
  server and adds tool-call timeout risk on hour-long Codex runs.
- `codex exec` sessions persist in the operator's normal `~/.codex/sessions` store, so agent-spawned
  threads and human TUI threads are the same kind of thing (`codex resume <id>` works on both).
  Wrappers that manage their own session namespace break that handoff.
- The repo already ships the mirror-direction skill (`skills/claude-sub-agent/SKILL.md`) and a
  production script using the same invocation shape (`scripts/samebase-pr-connect.ts`), so the
  pattern stays consistent with existing repo machinery.

## Follow-Ups

- Operator: install the official plugin from an interactive Claude Code session (commands above) if
  the `/codex:*` commands are wanted; the skill works without it.
- Separate task chip: fix the stale `--ask-for-approval` flag in `scripts/samebase-pr-connect.ts`.
