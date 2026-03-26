# 070 Noter UI PR Triggered Codex Local Automation Research

## Status

- Research
- Last updated: 2026-03-25

## Question

When Noter creates a draft PR from the noter.md UI, how should this machine
detect that PR, create or reuse a local worktree for it, start Codex on that
worktree, and let Codex continue the research and update the PR?

This research also covers what metadata the PR itself should carry so the local
runner does not need to guess.

Strategic direction update:

- this RFC remains the narrow PR-triggered local automation document
- for the broader "connected machines visible from the web UI / phone" product
  direction, see
  `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`

## Verified Current State

### Latest UI-created PR observed on 2026-03-25

As of 2026-03-25 21:13:36 UTC, the latest PR in `noter-md/noter` is:

- PR: `#337`
- title: `TODO.md[6]`
- head branch: `draft/todo-md-mn6jj7fs`
- base branch: `main`
- draft: `true`
- labels: none
- body: empty

Observed follow-up timeline:

- 2026-03-25 21:13:37 UTC: auto-added to a project by
  `github-project-automation[bot]`
- 2026-03-25 21:13:44 UTC: CodeRabbit posted its draft-skipped status comment
- 2026-03-25 21:17:56 UTC: Cloudflare Pages posted preview links

Conclusion: the current PR has no machine-readable marker that says "this came
from noter.md UI and should trigger local Codex work."

### How Noter creates draft PRs today

Current PR creation happens in the file-view push flow:

- `apps/noter/src/components/FileView.tsx`
- `apps/noter/convex/fileStagingActions.ts`

Important current behavior:

1. `buildDraftBranchName(...)` generates `draft/<slug>-<suffix>` branch names.
2. `createDraftPullRequest(...)` and
   `createDraftPullRequestFromDefaultBranch(...)` call
   `octokit.rest.pulls.create(...)`.
3. The PR create call currently sets only:
   - `title`
   - `head`
   - `base`
   - `draft: true`
4. The flow does not currently set:
   - PR body
   - labels
   - an origin marker
   - any link back to a Noter chat thread or first prompt

### What Noter stores today and what it does not

`agentThreadContext` in `apps/noter/convex/schema.ts` and messages persisted via
`apps/noter/convex/chat/index.ts` belong to Noter's own Convex-backed chat
product.

That state is **not** the same thing as a Codex Desktop or Codex CLI thread
today.

Current verified limitation:

- there is no shared thread id between the Noter Convex chat tables and Codex
  sessions
- there is no automatic bridge that rehydrates a Codex first message from the
  Noter chat tables
- the current draft-PR flow does not copy Noter chat context into PR metadata

Conclusion:

- if we want a local machine runner to act on a PR safely today, the PR itself
  needs to carry the first message and runtime contract
- reusing Noter chat state for Codex later is a future product decision, not a
  capability that already exists

### What Codex can already do on this machine

Observed locally on 2026-03-25:

- `codex exec` exists and can run Codex non-interactively in a target cwd
- `codex app` can open Codex Desktop for a target path
- `codex app-server` exists and exposes thread/turn RPCs
- `~/.codex/config.toml` currently sets:
  - `model = "gpt-5.4"`
  - `model_reasoning_effort = "xhigh"`

Important constraint:

- `codex app <path>` can open a workspace, but the public CLI does not expose a
  direct "open desktop app and seed first message" flag
- `codex app-server` is powerful enough to do `thread/start`, `turn/start`, and
  `thread/name/set`, but it is still an experimental surface

### What GitHub auth already exists on this machine

Observed locally on 2026-03-25:

- `gh auth status -t` shows an active `github.com` login for `nicu-chiciuc`
- the current token scopes include `repo`

That is enough for the MVP polling path to read PRs and update PR bodies,
comments, labels, and branches through `gh` / GitHub API calls without adding a
second auth layer first.

### What the repo already has for Codex app-server

This repo already has working app-server bridge code for GitHub Codespaces:

- `.codespace-agent/server.js`
- `apps/noter/convex/codespacesExecutor.ts`

That code already:

1. starts `codex app-server --listen stdio://`
2. initializes the runtime
3. exposes `/codex/thread/start`
4. exposes `/codex/turn/start`
5. passes `cwd`, model, approval policy, and `effort`

Important correction:

- this is a **Codespaces-only** path today
- it depends on Codespace records, `agentUrl`, and `agentToken`
- it is not a local-machine runner that can be started with `make connect`

What it proves:

- the repo already knows the Codex app-server RPC shape
- `thread/start` and `turn/start` are real operations the product has used in a
  remote environment

What it does **not** prove:

- that Noter already has a local app-server daemon
- that Codespaces and local worktrees share the same runtime management path

For local-machine app-server management, `~/dev/forks/t3code/` is the better
reference, especially:

- `~/dev/forks/t3code/apps/server/src/codexAppServerManager.ts`
- `~/dev/forks/t3code/apps/server/src/wsServer.ts`

## Requirements

The local solution should:

1. fail closed instead of guessing which PRs to handle
2. work on a single operator machine without new hosted infrastructure
3. avoid requiring inbound public networking for MVP
4. create or reuse a deterministic local worktree for the PR head branch
5. start Codex with an explicit first message and explicit model/effort
6. update the PR in GitHub so the run is visible there
7. dedupe already-handled PRs and head SHAs

## Options Evaluated

### Option A: Local poller + explicit PR metadata + `codex exec`

Mechanics:

1. The operator runs `make connect` locally.
2. That Make target runs a small repo-owned Node watcher.
3. The script polls GitHub for open PRs with an explicit Noter automation
   marker.
4. For each unclaimed PR/head SHA, the script creates or reuses a local worktree
   and runs `codex exec -C <worktree> ...`.

Pros:

- no inbound networking
- no webhook secret management
- no tunnel requirement
- works with the operator's existing `gh` login
- easiest MVP to reason about and debug
- matches the operator request for a local command such as `make connect`

Cons:

- not instant; latency is poll interval based
- `codex exec` is less explicit than app-server if you want a richer named
  thread lifecycle
- if the PR metadata is incomplete, the runner has to stop

Assessment:

- best MVP

### Option B: Repository webhook -> local listener via Cloudflare Tunnel

Mechanics:

1. Create a repository webhook for `pull_request`.
2. Expose a local HTTP listener through Cloudflare Tunnel.
3. Validate `X-Hub-Signature-256`.
4. Process `pull_request` actions such as `opened` and `labeled`.

Pros:

- near real-time
- scales better if more event types are needed later
- GitHub delivery/replay model is explicit

Cons:

- more moving parts
- requires tunnel lifecycle management on the local machine
- requires webhook secret validation, replay protection, and 10-second response
  discipline
- still needs a local durable queue/state layer after receipt

Assessment:

- viable phase 2
- unnecessary complexity for a single-machine MVP

### Option C: Local poller + extracted local app-server bridge

Mechanics:

1. Same trigger as Option A.
2. Instead of calling `codex exec`, the runner talks to a local HTTP bridge that
   reuses the same Codex RPC concepts as the existing Codespaces code, but runs
   them through a local daemon.
3. The bridge calls:
   - `thread/start`
   - `thread/name/set`
   - `turn/start`

Pros:

- true explicit thread lifecycle
- exact control over model and reasoning effort per run
- easier to attach richer thread metadata later
- lower implementation risk than a greenfield app-server client because this
  repo already has a remote proof of concept and `t3code` has a stronger local
  manager example

Cons:

- more code than plain `codex exec`
- still depends on an experimental Codex surface
- local daemon orchestration becomes more involved

Assessment:

- best phase 2 if "real Codex thread" is a hard requirement

## Recommendation

Ship this in two layers:

### Phase 1 (recommended MVP)

Use:

- explicit PR metadata from Noter
- a repo-owned `make connect` local watcher
- `codex exec` in a deterministic worktree

Why:

- simplest reliable path
- no public ingress
- no webhook or tunnel dependency
- still creates a persisted Codex session in shared `~/.codex`
- easiest to debug from the terminal with `gh`, `git`, and local logs

### Phase 2 (only if the MVP proves too weak)

Build a real local app-server manager and switch execution from `codex exec` to:

1. `thread/start`
2. `thread/name/set`
3. `turn/start`

Why:

- if you need a first-class named Codex thread with explicit runtime settings
- if you want the local runner to report thread ids back into the PR body or
  comments
- if the operator explicitly wants a local named-thread experience instead of a
  fire-and-wait `codex exec` run

## The Missing Contract: PR Metadata

Today the PR itself does not contain enough information to safely trigger local
automation.

The local runner should not infer intent from:

- `draft/` branch names alone
- `TODO.md[...]` titles alone
- empty bodies
- the mere fact that a PR came from Noter UI

Not every Noter-created PR should launch local Codex work.

### Recommended contract

Use both:

1. a visible opt-in label
2. a hidden machine-readable body marker

#### 1. Visible opt-in label

Recommended: reuse `research` only if that label truly means "start the local
research runner now." If not, add a more specific label such as:

- `codex-research`
- or `noter-ui-research`

The label is the fast filter. It is user-visible and easy to inspect.

#### 2. Hidden body marker

Store the real source of truth in the PR body as a single hidden HTML comment.

Example:

```html
<!-- noter-origin:v1 {"source":"noter_ui","mode":"research","firstMessage":"Research how to trigger local Codex when this PR is created and update the PR with findings.","requestedModel":"gpt-5.4","requestedReasoningEffort":"xhigh","repositoryFullName":"noter-md/noter","headRefName":"draft/todo-md-mn6jj7fs","noterThreadId":"optional-thread-id"} -->
```

Why both:

- labels are good filters but easy to toggle manually
- the hidden body block is durable, parseable, and can carry the first message
  plus runtime settings

### Fail-closed rule

If the label is present but the body marker is missing or invalid, the local
runner should:

1. refuse to auto-run
2. comment on the PR with the exact missing field
3. stop instead of guessing

## What the PR Body Should Show Publicly

Beyond the hidden marker, the visible PR description should include:

### First Message

The exact first user message that the local Codex run should follow.

### Requested Codex Runtime

- model: `gpt-5.4`
- reasoning effort: `xhigh`

This is important even though this machine already defaults to those values in
`~/.codex/config.toml`.

Why:

- the PR should be portable across machines
- the intent should be reviewable in GitHub
- the runner should not depend on a hidden local default

## Recommended First Codex Message

For a PR-triggered local run, the first message should be stored in the PR and
then passed into Codex almost verbatim.

Recommended template:

```text
A draft PR was created from noter.md UI for noter-md/noter.

PR: #<number>
Head branch: <headRefName>
Worktree: <worktreePath>

Read AGENTS.md and the current source-of-truth docs, then research and implement the work implied by this PR. Update the PR branch, PR description, and PR comments with your findings and validation.

First user message:
<firstMessage>

Requested Codex runtime:
- model: gpt-5.4
- reasoning effort: xhigh
```

This keeps the prompt explicit and reproducible.

## Local Runner Design

### Trigger mechanism

Recommended operator entrypoint:

- `make connect` for a long-running local watcher
- `make connect-once` for one polling cycle during testing or manual retries

Optional wrapper:

- `launchd` can run `make connect-once` on a schedule later if the operator
  wants the runner to survive terminal closes

The repo-owned script should keep `--once` so it stays easy to test manually and
easy to wrap with `launchd`.

### Detection flow

1. Read current open PRs from GitHub.
2. Filter to PRs with the explicit automation label.
3. Parse the hidden `noter-origin:v1` body marker.
4. Skip any PR/head SHA already handled.
5. Refuse to continue if `firstMessage`, model, or effort are missing.

Suggested stored dedupe key:

- `repoFullName + prNumber + headSha`

Suggested local state location:

- `~/.codex/noter-connect/state.json`

### Worktree flow

For the matched PR:

1. `git fetch origin <headRefName>`
2. create or reuse a deterministic local branch for that remote head
3. create or reuse a deterministic worktree path for that branch
4. run worktree bootstrap only when needed

Suggested deterministic path:

- `~/.codex/noter-connect/worktrees/pr-<number>-<sanitized-head>/noter`

Suggested checkout rule:

- fetch the PR head ref into a local branch with the same name
- reuse the worktree if it already exists
- never guess a different branch

### Execution flow

#### MVP path

This branch now ships that MVP as:

- `make connect`
- `make connect-once`

Run:

```bash
codex exec \
  -C <worktreePath> \
  -c 'model="gpt-5.4"' \
  -c 'model_reasoning_effort="xhigh"' \
  "<first-message-template>"
```

Notes:

- keep the model and effort explicit even if the local config already matches
- do not use `--ephemeral`; the session should persist in shared Codex state
- write the last message and JSON event stream to local artifacts if you want
  richer post-run reporting
- use the PR body marker, not Convex chat state, as the durable cross-system
  contract

#### Rich-thread path

If phase 2 is needed, build a local daemon that uses the same Codex RPC calls:

1. start `codex app-server --listen stdio://`
2. call `initialize`
3. call `thread/start` with `cwd`
4. call `thread/name/set`
5. call `turn/start` with `input`, `model`, and `effort`

The remote proof and local reference points are:

- `.codespace-agent/server.js`
- `apps/noter/convex/codespacesExecutor.ts`
- `~/dev/forks/t3code/apps/server/src/codexAppServerManager.ts`

## PR Update Behavior

Once the runner claims a PR, it should immediately post a short checkpoint
comment that says:

1. the run was claimed
2. which machine claimed it
3. which local run id claimed it
4. which model and reasoning effort were requested

Do **not** post raw local filesystem paths to GitHub comments. Keep those local
to the operator machine.

When the run finishes, it should:

1. push branch changes if any
2. update the PR body if the scope changed
3. post a short completion comment with:
   - summary
   - validation
   - whether code was changed
   - whether more review is needed

## Why polling wins for MVP

Polling is the right first step here because it avoids three classes of
complexity that do not help the product decision:

1. inbound connectivity
2. webhook security and replay handling
3. always-on local HTTP services before the core contract is proven

On a single operator machine, the real product risk is not event latency. The
real product risk is ambiguous PR intent.

That is why the most important change is not the daemon. It is the PR metadata
contract.

The Convex local-first article is useful here only as a design reminder: when a
workflow needs durable coordination or third-party events, it is often more
convenient to drive the flow from a coordinator instead of hiding everything in
client-local state. In this case, the PR body and GitHub state are that durable
coordination surface for the MVP, not Noter's internal chat tables.

## Concrete Implementation Plan

### 1. Noter product change

When the user creates a PR that should trigger local Codex work:

1. apply the explicit automation label
2. write the visible PR sections:
   - `Why`
   - `First Message`
   - `Requested Codex Runtime`
3. append the hidden `noter-origin:v1` marker

### 2. Local runner MVP

Add and use a local-only script behind `make connect` that:

1. polls GitHub
2. claims matching PRs
3. creates or reuses a worktree
4. runs `codex exec`
5. updates the PR

### 3. Optional phase 2

Build a dedicated local app-server manager, borrowing RPC shape from the
Codespaces implementation and runtime management ideas from `t3code`.

## Open Questions

1. Should the visible opt-in label be a new dedicated label instead of
   overloading `research`?
2. Should the local runner always push directly to the PR head branch, or should
   it be able to open a follow-up branch when the PR is marked as "proposal
   only"?
3. Should the runner comment immediately when metadata is malformed, or should
   it also auto-remove the trigger label to avoid repeated retries?
4. If the user wants an actual Codex Desktop window to open, is `codex app`
   sufficient after the run starts, or is the app-server path required from the
   beginning?

## Sources

### Local repo and machine verification

- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/convex/chat/index.ts`
- `apps/noter/convex/schema.ts`
- `.codespace-agent/server.js`
- `apps/noter/convex/codespacesExecutor.ts`
- `codex --help`
- `codex exec --help`
- `codex app --help`
- generated app-server protocol bindings from `codex app-server generate-ts`
- local `~/.codex/config.toml`
- `gh pr view 337 --json ...`
- `gh api repos/noter-md/noter/issues/337/events?per_page=100`

### External docs

- GitHub webhook events and payloads:
  https://docs.github.com/en/webhooks/webhook-events-and-payloads
- GitHub repository webhooks REST API:
  https://docs.github.com/en/rest/repos/webhooks
- GitHub issue event types:
  https://docs.github.com/en/rest/using-the-rest-api/issue-event-types
- GitHub searching issues and pull requests:
  https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- GitHub webhook best practices:
  https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- Apple launchd job guidance:
  https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
- Cloudflare Tunnel overview: https://developers.cloudflare.com/tunnel/
