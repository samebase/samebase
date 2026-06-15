---
name: claude-sub-agent
description:
  Use the local Claude Code CLI as a bounded Codex sidecar. Trigger when the user says "use claude
  sub agent", "ask Claude", "Claude review", "run Claude on this branch/PR", or wants a second model
  review, research pass, or isolated Claude experiment.
---

# Claude Sub Agent

Use Claude Code through the local subscription-backed CLI. Default to Opus 4.8 and max effort for
ordinary one-shot calls. Use Ultracode when the user asks for workflow orchestration, current web
research, or the strongest Claude review; expect it to be slower and credit-hungry.

## One-Shot Answers

Use print mode when Codex needs Claude's answer in the current turn:

```bash
claude --safe-mode -p --output-format json --permission-mode plan --tools '' --model claude-opus-4-8 --effort max --max-turns 1 "<prompt>"
```

For live progress, use stream JSON:

```bash
claude --safe-mode -p --output-format stream-json --verbose --include-partial-messages --permission-mode plan --tools '' --model claude-opus-4-8 --effort max --max-turns 1 "<prompt>"
```

For small file reviews, Codex should read the exact files and pass the relevant content inline. Tell
Claude not to use tools, not to inspect sibling files, and to return only findings or a clear empty
result.

## Web And Ultracode Reviews

Use stream JSON when the user asks for current web research or Ultracode so Codex can monitor a
longer run:

```bash
claude --safe-mode -p --output-format stream-json --verbose --include-partial-messages --permission-mode auto --tools WebSearch,WebFetch --model claude-opus-4-8 --settings '{"ultracode": true}' --max-turns 8 "<prompt>"
```

Pass the exact local file content inline. Ask Claude to prefer official Claude Code docs and cite
sources. Do not add a tiny `--max-budget-usd` cap to Max subscription runs unless the user asks for
one; use `--max-turns`, streaming output, and manual stop/attach instead. If a long run stalls or
keeps researching after enough context is gathered, resume the same session with tools disabled and
ask for a final answer:

```bash
claude --safe-mode -p --resume <session-id> --output-format stream-json --verbose --include-partial-messages --permission-mode plan --tools '' --model claude-opus-4-8 --effort max --max-turns 1 "Stop researching. Return findings now."
```

## Background Jobs

Use background mode for detached Claude sidecars that Codex or a Codex monitor can poll:

```bash
claude --safe-mode --bg --name "<repo>-<short-purpose>" --permission-mode plan --tools '' --model claude-opus-4-8 --effort max "<prompt>"
claude agents --json --all --cwd "$PWD"
claude logs <id>
claude attach <id>
claude stop <id>
claude rm <id>
```

Use a Codex subagent as a monitor only when the main thread has useful work to continue. Give it the
Claude job id, ask it to poll `agents --json` and `logs`, and have it report completion, stalls,
daemon/log errors, and cleanup needs.

For read-only codebase probes that actually need tools:

```bash
claude --safe-mode --bg --name "<repo>-<short-purpose>" --permission-mode auto --tools Read,Bash --disallowedTools Edit,Write --model claude-opus-4-8 --effort max "<prompt>"
```

## Operational Notes

- `--safe-mode` is the subscription-friendly isolation flag: it disables customizations but keeps
  auth, model selection, built-in tools, and permissions.
- Do not use `--bare` for the user's Claude subscription flow; it skips OAuth/keychain auth and
  requires `ANTHROPIC_API_KEY` or an API key helper.
- Before quota-heavy runs, `claude auth status --json` should show `authMethod: "claude.ai"`,
  `apiProvider: "firstParty"`, and the expected `subscriptionType`.
- If `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set, non-interactive `-p` can use API/Console
  credentials instead of the subscription; unset those when the intent is Max subscription credit.
- Subscription-backed `claude -p` uses monthly Agent SDK credit. `total_cost_usd` in CLI output is
  credit accounting, not proof that Console API overage was charged.
- `--max-turns` is a print-mode control; do not rely on it for `--bg`. Use `--max-budget-usd` only
  as an explicit stop-loss after checking which auth path is active.
- `--tools ''` disables built-in tools. Use `--tools WebSearch,WebFetch` for web-only research.
- `--model claude-opus-4-8` pins Opus 4.8. `--model opus` is only an alias for latest Opus.
- Ultracode is enabled with `--settings '{"ultracode": true}'`; it is not an `--effort` value.
- If `claude logs` or `daemon status` reports `/tmp/cc-daemon-*` `ENOENT`, check
  `claude agents --json --all --cwd "$PWD"` and retry after starting the daemon with a Claude
  command.
- If logs warn that `~/.local/bin/claude` is missing or broken, run `claude install --force`.
- If auth fails, ask the user to run `claude auth login`; never print tokens or full env dumps.
