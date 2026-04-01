# 081 Rivet agentOS TypeScript LSP Research

## Document Control

- Status: Draft research
- Owner: Noter frontend/editor
- Last updated: 2026-04-01
- Depends on:
  - `apps/noter/src/components/MonacoEditor.tsx`
  - `apps/noter/src/components/monaco/setupEditor.ts`
  - `apps/noter/src/components/monaco/ata.ts`
  - `apps/noter/src/hooks/useProjectFiles.ts`
  - `apps/noter/package.json`
- External references:
  - [Nathan Flurry post: 2026-03-31](https://x.com/NathanFlurry/status/2039017546649907674)
  - [Rivet post: 2026-03-31](https://x.com/rivet_dev/status/2039015678959853678)
  - [Rivet agentOS quickstart](https://www.rivet.dev/docs/agent-os/quickstart)
  - [Rivet agentOS architecture](https://www.rivet.dev/docs/agent-os/architecture)
  - [Rivet agentOS deployment](https://www.rivet.dev/docs/agent-os/deployment)
  - [Rivet agentOS limitations](https://www.rivet.dev/docs/agent-os/limitations)
  - [TypeScript `tsserver`](<https://github.com/microsoft/TypeScript/wiki/Standalone-Server-(tsserver)>)
  - [TypeScript Language Server](https://github.com/typescript-language-server/typescript-language-server)
  - [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)

## Question

Can Noter include what Rivet is showing in the March 31, 2026 `agentOS` posts
directly in the browser so Monaco gets correct TypeScript LSP behavior?

This research also covers the narrower follow-up question raised by the Nathan
Flurry post:

- does `agentOS` materially change the answer for browser-side TypeScript
  correctness
- if not, what is the most plausible Noter architecture if we want VS Code-like
  TypeScript behavior later

## Short Answer

No, not as a direct browser drop-in.

The March 31, 2026 Rivet / Nathan Flurry posts make `agentOS` look promising as
an embedded runtime for backend-hosted tools, but they do not change the core
fact that "correct" TypeScript editor intelligence comes from `tsserver`, which
is a Node process, or from an LSP wrapper around it.

For Noter, the best reading is:

1. `agentOS` could plausibly host a real TypeScript service for us
2. it does not look like something we should bundle into the browser in order to
   replace Monaco's local TypeScript worker directly
3. if we want meaningfully more accurate TypeScript semantics, the likely shape
   is still:
   - host `tsserver` or `typescript-language-server` on the backend
   - connect Monaco to it from the browser
   - mirror unsaved file state into that service

## Verified Current State In Noter

### 1. Noter does not use a real LSP client for TypeScript today

`apps/noter/src/components/MonacoEditor.tsx` mounts Monaco directly and wires it
to the collaborative editing layer. There is no `monaco-languageclient`,
WebSocket LSP bridge, or `tsserver` transport in the current frontend.

### 2. The current Monaco TypeScript behavior is an approximation layer

The current implementation improves Monaco's built-in TypeScript worker by:

- setting compiler options in `setupEditorATA(...)`
- using `@typescript/ata` for automatic type acquisition
- reading project files and injecting them through `addExtraLib(...)`
- parsing a subset of `tsconfig.json`

This is useful, but it is still not equivalent to a full project service.

### 3. Noter intentionally caps the project context for Monaco

`apps/noter/src/hooks/useProjectFiles.ts` limits project file hydration to
`MAX_BATCH_FILE_PATHS = 200` and skips large files, `node_modules`, `dist`, and
other directories. That is a pragmatic browser-memory guardrail, but it also
means TypeScript context can be incomplete for larger repos.

### 4. The current implementation already shows where correctness can drift

`apps/noter/src/components/MonacoEditor.tsx` explicitly documents why the code
uses `addExtraLib(...)` instead of creating many Monaco models:

- to avoid out-of-memory crashes
- to avoid revalidating hundreds of files

That tradeoff is sensible for a browser editor, but it is another signal that
the current setup is optimizing for bounded frontend cost, not for exact
project-level parity with VS Code.

### 5. The current dependency graph also reflects that browser-local approach

`apps/noter/package.json` includes:

- `@monaco-editor/react`
- `@typescript/ata`
- `typescript`

It does not currently include:

- `monaco-languageclient`
- `typescript-language-server`
- a repo-owned TypeScript/LSP bridge

## External Findings

### 1. Nathan Flurry's March 31, 2026 post is about an embeddable runtime

The Nathan Flurry post says Rivet built a new operating system that is:

- powered by WASM and V8 isolates
- ships `node`, `python`, `bash`, `git`, `grep`, `curl`, and more
- can mount storage surfaces like S3, Google Drive, and SQLite
- is embedded as a library with no special infrastructure

That is a strong signal for "host-side runtime you embed into your backend." It
is not a direct claim that the runtime is intended to be bundled into a browser
Monaco editor.

### 2. Rivet's own docs frame agentOS as a backend/actor runtime

Rivet's docs describe `agentOS` as something you run through `rivetkit` or embed
in a Node.js backend. The quickstart shows a server registry plus a separate
client. The architecture and deployment docs also frame it as a VM / runtime
service, not as browser-only code.

### 3. Rivet documents a lightweight VM plus optional heavier sandbox

The agentOS docs say the lightweight VM handles common coding workloads, while
heavier jobs like browser automation can escalate to a full sandbox. That is
another backend-oriented execution model, not a browser-bundle model.

### 4. TypeScript's native editor engine is still `tsserver`

The TypeScript project documents `tsserver` as a Node executable that exposes
editor intelligence over JSON/stdin/stdout. This is the native TypeScript editor
protocol surface.

### 5. `typescript-language-server` is still a wrapper around `tsserver`

The TypeScript Language Server README explicitly describes itself as a thin LSP
layer on top of `tsserver`. That means an LSP stack is still ultimately a host
for `tsserver`, not a replacement for it.

### 6. Monaco's usual LSP bridge assumes a host-side language server

`monaco-languageclient` supports both browser-worker examples and external
language servers, but the common path for serious language tooling is still an
external process or service. Its examples reinforce that Monaco is the client,
not the place where heavyweight language services should automatically live.

## What This Means For Noter

### Option A: Keep the current browser-only Monaco path

This means:

- keep ATA
- keep `addExtraLib(...)`
- keep bounded project hydration

Pros:

- lowest complexity
- no new backend services
- stays aligned with the current architecture

Cons:

- TypeScript accuracy will continue to drift from VS Code in larger or more
  complex repos
- features that rely on full project state will remain approximate

Assessment:

- best if the goal is "good enough browser TypeScript"

### Option B: Add a real TypeScript service without agentOS

This means:

- run `tsserver` or `typescript-language-server` in a small Node sidecar
- connect Monaco from the browser
- mirror open and unsaved files into that service

Pros:

- most direct route to correctness
- smaller conceptual jump than introducing a whole new runtime platform
- aligns with the TypeScript ecosystem's source of truth

Cons:

- requires new backend orchestration
- requires file-state synchronization rules
- requires operational work around process lifecycle and multi-user isolation

Assessment:

- the clearest path if TypeScript accuracy becomes a priority

### Option C: Use agentOS as the host for that TypeScript service

This means:

- use agentOS as the process/filesystem runtime
- run `tsserver` or an LSP wrapper inside that runtime
- treat Monaco as the browser client

Pros:

- could fit a future "editor plus durable hosted tooling" direction
- gives a unified host for filesystem, processes, and other coding tools
- matches the sort of capability Rivet is advertising

Cons:

- larger architecture move than the narrow TypeScript problem requires
- still does not avoid the need for a backend service boundary
- would add a new platform dependency before proving the TypeScript use case

Assessment:

- plausible future direction
- probably too large as the first move if the immediate goal is just "correct TS
  LSP"

## Recommendation

If the product goal is specifically "make TypeScript in Noter behave more like
VS Code," the best next step is not "embed agentOS in the browser."

The best next step is a small architecture RFC for:

1. a backend-hosted `tsserver` or `typescript-language-server`
2. a Monaco client bridge
3. an explicit synchronization model for:
   - open files
   - unsaved file contents
   - branch/worktree/repo identity

If that RFC later concludes that we also want a durable process/filesystem
runtime for more than TypeScript, then `agentOS` becomes more interesting as the
host. But it should be evaluated as backend infrastructure, not as a browser
editor dependency.

## Decision Summary

- `agentOS` looks promising as a host runtime, not as a browser drop-in
- the Nathan Flurry post strengthens the backend-hosting interpretation
- the current Noter Monaco setup is intentionally approximate and bounded
- "correct TypeScript LSP" still points toward `tsserver` on the backend
