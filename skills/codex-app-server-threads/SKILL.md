# Skill: Codex App-Server Threads

## Goal

Start and drive several parallel Codex threads programmatically through `codex app-server`, so one
supervisor session can fan out reviews, research probes, or second opinions and collect each
thread's final message. Threads are persisted Codex sessions: the operator can reopen any of them
later with `codex resume <threadId>` or from the Codex desktop sidebar.

## When To Use

- The operator asks to "start codex threads" / "use the app server" for a review or research task.
- You want N independent Codex perspectives on a diff, RFC, or bug without leaving this session.

For Claude-side fan-out use `skills/delegation-orchestrator/SKILL.md` instead; this skill is
specifically for spawning OpenAI Codex as the worker.

## Quick Start

```bash
node skills/codex-app-server-threads/scripts/run-codex-threads.mjs \
  --cwd "$(git rev-parse --show-toplevel)" \
  --out /tmp/codex-reviews \
  prompts/claims.md prompts/design.md prompts/adversarial.md
```

Each prompt file becomes one thread (label = basename). Defaults are review-safe:
`--sandbox read-only`, `--approval never`, per-thread `--timeout-mins 20`, model from the user's
Codex config. The script writes `<out>/<label>.md` per thread plus `summary.json`, prints
`codex resume` hints, and exits non-zero if any thread did not complete.

## Review-Thread Pattern

- One lens per thread: claims-vs-code verification, design fit, adversarial edge cases. Identical
  prompts buy redundancy, not coverage.
- Require evidence: ask each thread for `file:line` anchors and an explicit verdict per finding, so
  results can be merged without rereading the sources.
- Tell threads they are read-only and must not edit files; the sandbox enforces it, and saying so
  stops them from wasting turns attempting writes.

## Protocol Facts (verified against codex-cli 0.133.0)

JSON-RPC 2.0, newline-delimited, over stdio (`codex app-server`). Casing below is what the installed
CLI accepts; newer protocol docs show camelCase variants (`readOnly`, `unlessTrusted`) — regenerate
the local schema before trusting either across CLI upgrades:

```bash
codex app-server generate-json-schema --out <dir>   # ClientRequest.json, ServerNotification.json
```

- Handshake: `initialize` request (`clientInfo`), then `initialized` notification. The server
  rejects everything before it.
- `thread/start` params: `cwd`, `approvalPolicy` (`never` | `on-failure` | `on-request` |
  `untrusted`), `sandbox` (`read-only` | `workspace-write` | `danger-full-access`), optional
  `model`. Result carries `thread.id`.
- `turn/start` params: `threadId`, `input: [{ type: "text", text }]`, optional `effort`,
  `outputSchema`. One server multiplexes many threads; every notification carries `threadId`.
- Final answer: the last `item/completed` whose `item.type === "agentMessage"` before
  `turn/completed`. Ignore deltas. `turn/completed` carries `turn.status`
  (`completed`/`failed`/`interrupted`) and `turn.error`.
- Approvals arrive as server→client requests (`*/requestApproval`); with `never` + `read-only` none
  should arrive, and the runner declines any that do so a run cannot hang.
- `review/start` exists as a dedicated code-review mode; this skill uses plain turns because review
  prompts here need custom lenses and doc targets.

## References

- Official protocol doc: https://developers.openai.com/codex/app-server (raw:
  https://developers.openai.com/codex/app-server.md)
- Upstream reference client: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
