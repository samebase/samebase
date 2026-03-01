# Idea: Worktree Conversation Log as a Committed Markdown File

## Core proposal

Every new worktree starts with a default conversation file that is versioned in
git on that branch. The conversation is appended at message boundaries (user
submit + assistant final response), not token-by-token.

This makes the thread portable across tools (Codex, Noter, other agents) and
replayable from git history.

## Why this is useful

- Conversation context becomes durable and branch-local.
- Any tool that can read files can reconstruct the working context.
- Git history gives a timeline of reasoning, decisions, and changes.
- Noter can read the branch file directly, no separate chat sync protocol
  needed.

## Recommended file shape

Use one default file per worktree:

- `worktree.md` (already present in this repo and currently empty), or
- `.noter/conversation.md` if we want app-specific namespacing.

Suggested frontmatter:

```md
---
schema: noter-conversation-v1
worktree: codex/feature-name
createdAt: 2026-03-02T00:00:00Z
---
```

Suggested message block format:

```md
## 2026-03-02T00:15:10Z - user

We should persist this conversation in the branch.

## 2026-03-02T00:15:42Z - assistant

Agreed. I will append only on completed messages and commit in batches.
```

## Write triggers (important)

Append only when a message is complete:

1. user sends a message
2. assistant finishes a full response

Do not append partial tokens or streaming fragments.

## Commit strategy

Do not commit every message by default. Prefer low-noise batching:

- Stage conversation updates continuously
- Auto-commit on one of:
  - explicit user command (`commit`, `push`, `create pr`, `ship`)
  - idle timeout (for example 5-10 minutes)
  - session end / clean shutdown

Commit message example:

`chore(conversation): append worktree chat log`

## Noter integration path

Noter can treat the file as first-class context:

- detect and show the conversation file in the branch file tree
- render it as a chat-like timeline view
- optionally include it in AI context selection

No cross-product API coupling is required if both tools agree on file format.

## Guardrails

- Redact secrets/tokens before append
- Add opt-out per repo or per worktree
- Keep max file size bounded (rotate to `conversation-2.md` if needed)
- Optionally support a compact mode that stores summaries for long sessions

## Risks

- Git noise if commit cadence is too aggressive
- Sensitive data persistence if redaction is weak
- Merge conflicts if multiple tools append concurrently

## Mitigations

- Batch commit policy + stable append format
- Deterministic secret scrubber before write
- File locking or append queue in tool runtime
- Optional single-writer mode per worktree session

## Iteration plan

1. Manual phase: maintain `worktree.md` by hand in active worktrees.
2. Agent phase: Codex auto-appends at message boundaries.
3. Product phase: Noter reads/renders the file as a thread.
4. Optimization phase: summarization, rotation, and conflict handling.

## Open questions to keep exploring

- Should this live at repo root (`worktree.md`) or inside `.noter/`?
- Should we include tool actions (commands, diffs, test results) inline or only
  conversational text?
- Should merge to `main` keep or squash/remove conversation logs?
- Should there be one file per session day or one rolling file per branch?

## Next concrete experiment

For the next worktree session:

1. append user + assistant messages to `worktree.md`
2. commit once at natural checkpoints
3. inspect readability and merge behavior after rebase
4. adjust schema before automating
