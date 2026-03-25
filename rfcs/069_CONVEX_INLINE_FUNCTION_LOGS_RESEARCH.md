# 069 Convex Inline Function Logs Research

## Document Control

- Status: Research note
- Owner: Noter product/editor
- Last updated: 2026-03-25
- Depends on:
  - `apps/noter/src/components/MonacoEditor.tsx`
  - `apps/noter/convex/infraRead.ts`
  - `apps/noter/convex/infraProvisioning.ts`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`

## Purpose

Research how Noter could show recent Convex logs near the corresponding function
definition inside the editor, borrowing the useful part of Darklang's
trace-driven feel without trying to recreate expression-level bubbles or full
live values.

The target MVP is narrower:

1. same file
2. same function definition line
3. recent logs only
4. request-grouped summaries, not full replay/debugger UX

## Research Questions

1. What log metadata does Convex expose today through documented surfaces?
2. Can Noter map those logs back to a repository file and a stable editor line?
3. What is the smallest editor UI that feels meaningfully "near the code"?
4. Which fetch path fits Noter's current architecture and policy constraints?

## Current Noter State

### Existing "Convex logs" support is not function logs

`apps/noter/convex/infraRead.ts` currently exposes `getConvexLogs`, but that
action does not read runtime function logs. It calls
`/projects/{projectId}/list_deployments` and formats recent deployment activity
rows.

That means Noter already has:

- vault-to-Convex deployment metadata
- user-scoped Convex credentials
- a prod-read approval flow

But it does not yet have:

- recent function console logs
- failure stack traces grouped by request
- any function-to-line attribution in the editor

### Relevant editor surface already exists

`apps/noter/src/components/MonacoEditor.tsx` already owns the active-file Monaco
instance and is the right place to add function-line decorations or an inline
peek panel.

The current editor already has:

- active file path
- full active file content
- repository tree
- scoped project file loading via `useProjectFiles`

That is enough for a same-file MVP without adding a second editor surface.

### Policy constraint

`specs/004_AI_PROD_ACCESS_POLICY_SPEC.md` explicitly requires approval for every
production logs/data read.

That means "auto-refresh inline prod logs while browsing code" is not policy
compatible as written today. Any MVP must either:

1. stay out of production deployments, or
2. make the fetch explicitly user-triggered and approval-gated

## External Findings

### Convex exposes the right function identifier, but not a source line

As researched on 2026-03-25, Convex's documented logs surfaces provide:

- request ID
- function name/path
- success/failure outcome
- console payloads
- error text and stack trace for failures

The Convex Logs dashboard documents that recent logs include time, request ID,
outcome, invoked function name, log lines/exceptions, and duration. It also
documents that the logs page is only a short recent history, and recommends log
streams for longer retention.

Convex log streams document structured `console` and `function_execution`
events. Those events include:

- `function.path`, for example `myDir/myFile:myFunction`
- `function.request_id`
- `log_level` and `message` for console events
- `status` and `error_message` for function execution events

The same log stream docs define `function.path` as a file-derived function path,
not a source location. Convex gives Noter a stable function identity, but not a
first-class source line number.

### Convex function path is enough to recover file attribution

Convex query docs state that function names are derived from the file path under
`convex/` plus the exported function name.

That makes file attribution straightforward:

- `messages:send` maps to `convex/messages.ts` export `send`
- `myDir/myFile:myFunction` maps to `convex/myDir/myFile.{ts,tsx,js,jsx}` export
  `myFunction`

This is enough to anchor logs to the correct repository file even without stack
trace parsing.

### Source line attribution can be editor-local

For the MVP, Noter does not need AST-perfect trace mapping.

Given:

- the active file path
- the Convex `function.path`
- the exported function name

Noter can find the function definition line locally by matching the exported
symbol in the current Monaco model.

For a first pass, matching these patterns is sufficient:

- `export const <name> =`
- `export async function <name>(`
- `export function <name>(`

This is intentionally narrower than "all possible TypeScript export shapes", but
it matches standard Convex examples and gets the inline anchor to the right line
in the common case.

### The public Convex Management API does not currently expose documented log reads

As researched on 2026-03-25, the public Convex OpenAPI spec at
`https://api.convex.dev/v1/openapi.json` exposes project/deployment/team
management endpoints, but did not expose documented paths for reading recent
function logs or configuring log streams.

This is an inference from the published OpenAPI surface, not a Convex statement
that such APIs do not exist internally.

Practical consequence:

- Noter's current `providers.convex.request(...)` pattern cannot simply be
  extended with another documented REST path to fetch logs.

### MCP/CLI surfaces do expose structured recent logs

Convex's MCP server docs list a `logs` tool that fetches recent function
execution logs as structured objects, similar to `npx convex logs`.

That is useful evidence that Convex already has an internal structured log read
path behind CLI/MCP tooling, but it is not the same thing as a documented
web-product API for Noter's backend.

### Darklang inspiration: copy the code anchor, not the whole product model

Darklang's docs and product writeups show the important product idea:

- runtime traces are visible beside the code
- recent traces anchor developer attention to the exact handler being edited
- replay/live values go deeper, but the anchoring itself already creates value

The right thing for Noter to copy is the proximity:

- show runtime evidence at the function definition line

The wrong thing to copy in v1 is the whole Darklang stack:

- expression-level values
- replay controls
- trace bubbles on every subexpression

## Key Findings

1. File attribution is easy enough today because Convex emits `function.path`.
2. Line attribution is feasible for an MVP without stack trace parsing or AST
   infrastructure.
3. The hard part is not Monaco. The hard part is getting structured logs into
   Noter through a documented, product-safe access path.
4. Automatic production polling would conflict with Noter's current
   approval-first prod-read policy.
5. A useful MVP should stay function-level. Expression-level bubbles are not
   needed to make this feature worth shipping.

## Options Considered

### Option A. Scrape dashboard-like log pages or rely on undocumented APIs

Pros:

- might produce something quickly

Cons:

- not a stable contract
- likely brittle against Convex dashboard changes
- poor fit for a product feature

Assessment:

Reject.

### Option B. Run Convex CLI or MCP as a sidecar and fetch recent logs on demand

Shape:

- run a Convex-authenticated helper process
- call the CLI/MCP `logs` surface
- return structured recent log entries to Noter

Pros:

- uses a documented user-facing tool surface
- recent structured logs already exist
- avoids dashboard scraping
- good fit for an operator-only or dev-only experiment

Cons:

- Noter backend does not currently have a clean always-on CLI sidecar model for
  this feature
- depends on runtime process management and auth handoff
- recent-history only
- still requires separate policy handling for prod

Assessment:

Viable for a spike or owner-only experiment, but not the cleanest web-product
foundation.

### Option C. Ingest Convex log streams into Noter and query them reactively

Shape:

- Convex sends structured log stream events to a Noter-owned ingestion endpoint
- Noter stores a bounded recent window keyed by vault, function path, and
  request ID
- Monaco queries the stored events and decorates the active file

Pros:

- web-native shape
- stable structured schema
- easy request grouping and editor queries
- natural fit for reactive UI
- easiest path to request history beyond the short dashboard window

Cons:

- requires log stream setup on the Convex side
- as of this research, public Management API docs do not show a log stream
  configuration endpoint, so initial setup may need to be manual
- automatic prod ingestion still needs a policy decision

Assessment:

Best long-term product shape.

## Recommended Direction

Use a two-step plan:

1. product recommendation: log-stream ingestion
2. MVP UI recommendation: same-file, same-line function anchors only

### Recommended product architecture

For the shipped feature direction, prefer log-stream ingestion over CLI/MCP
sidecars.

Reasoning:

1. Noter is a web product, and stored structured events fit the existing Convex
   query model better than process-managed CLI calls.
2. Monaco decorations want queryable data keyed by file/function/time, not raw
   terminal text.
3. Grouping by `request_id` becomes trivial once the events are stored.
4. This avoids building a long-lived hidden command runner just to answer UI
   queries.

### Recommended MVP scope

Only support:

- files inside `convex/`
- exported deployed functions only
- active file only
- recent logs only
- function-definition anchors only

Do not support in v1:

- expression-level bubbles
- replay buttons
- helper-function attribution inside the function body
- non-active-file overlays
- automatic background polling of production logs

### Recommended editor behavior

When the active file is a Convex function file:

1. resolve recent events for that file's deployed exports
2. attach a subtle line decoration to the exported function line
3. show a compact summary such as:
   - `2 failures in last 15m`
   - `5 recent logs`
   - `last request 3m ago`
4. on click, expand a lightweight inline panel or peek-like row anchored to the
   same line
5. group entries by `request_id`
6. within each request group show:
   - timestamp
   - status
   - first few console lines
   - truncated error/stack summary for failures

This gets the "Darklang near the code" value without needing a new visual
language.

### Recommended line-resolution rule

For each event:

1. parse `function.path` into:
   - module path
   - exported function name
2. resolve the repository file by matching the module path against the current
   tree with supported extensions
3. if the resolved file is the active file, find the exported function line in
   the Monaco model
4. anchor the summary there

If line resolution fails, do not invent a location. Fall back to file-level only
or omit the inline decoration for that function.

## Suggested Data Shape

If Noter ingests log stream events, a bounded table should store only the fields
needed for the editor:

- `vaultId`
- `deploymentName`
- `functionPath`
- `functionType`
- `requestId`
- `topic`
- `timestamp`
- `logLevel?`
- `message?`
- `status?`
- `errorMessage?`

Useful derived fields at ingest time:

- `repoFilePath`
- `exportName`

Useful indexes:

- by vault + file + timestamp
- by vault + function path + timestamp
- by vault + request ID

Retention should stay intentionally short for MVP.

## Rollout Recommendation

### Phase 0. Research spike

Validate one vault end to end with either:

- manual log stream setup, or
- a temporary MCP/CLI sidecar

Success criterion:

- Noter can resolve at least one recent Convex log to the correct file and
  exported function line inside Monaco.

### Phase 1. Editor MVP

Ship:

- active-file Convex function decorations
- request-grouped inline summaries
- failure-first prioritization

Do not ship:

- cross-file navigation
- full historical search
- background prod auto-refresh

### Phase 2. Broader coverage

Only after MVP proves useful:

- add file-tree indicators for non-active files
- improve export-line resolution with a real parser if heuristics are
  insufficient
- decide whether production inline logs should remain explicitly user-triggered
  or get a separate policy/consent model

## Open Questions

1. Is manual log stream setup acceptable for the first shipped iteration, or is
   automated provisioning a hard requirement?
2. Should inline logs be limited to non-production deployments until the
   approval model is revised?
3. Should the MVP show all recent requests or only failures and requests with
   console output?
4. Is active-file-only enough for the first version, or does the feature need a
   file-tree badge to feel discoverable?

## Source Links

### Product/code context

1. `apps/noter/convex/infraRead.ts`
2. `apps/noter/src/components/MonacoEditor.tsx`
3. `apps/noter/src/hooks/useProjectFiles.ts`
4. `apps/noter/convex/infraProvisioning.ts`
5. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`

### External sources

1. Convex logs dashboard docs:
   <https://docs.convex.dev/dashboard/deployments/logs>
2. Convex log streams schema:
   <https://docs.convex.dev/production/integrations/log-streams/>
3. Convex MCP server docs: <https://docs.convex.dev/ai/convex-mcp-server>
4. Convex query naming docs: <https://docs.convex.dev/functions/query-functions>
5. Convex error handling docs:
   <https://docs.convex.dev/functions/error-handling/>
6. Convex public OpenAPI spec: <https://api.convex.dev/v1/openapi.json>
7. Darklang unique aspects:
   <https://docs.darklang.com/discussion/unique-aspects>
8. Darklang office sign-in walkthrough:
   <https://blog.darklang.com/building-an-office-sign-in-in-dark/>
