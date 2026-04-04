# 080 Machines Markdown Transcript Spec

## Document Control

- Status: Accepted implementation plan
- Owner: connected machine transcript surface
- Last updated: 2026-04-04
- Related docs:
  - `specs/077_CONNECTED_MACHINE_MAIN_THREAD_SURFACE_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`

## Summary

The `/machines` selected-thread pane should stop rendering each hydrated message
as a separate `ProsemarkReadOnly` instance and should instead render a single
linear markdown transcript document.

The transcript format uses visible level-2 headings as boundaries:

1. `## @user`
2. `## @assistant`
3. `## @work`

Each section may include a reserved metadata bullet list directly under the
heading. This keeps the raw markdown readable and copyable, lets browser
selection span the whole conversation, and gives `/machines` and file-facing
exports one shared visible document format.

## Problem Statement

Today `/machines` renders user and assistant messages through separate
`ProsemarkReadOnly` surfaces inside `MachinesWorkspaceThreadPane`.

That creates two product problems:

1. browser text selection does not extend cleanly across message boundaries
2. copy/download/export has no plain markdown source that matches what the user
   reads in the machine thread pane

This is specifically a read-only transcript problem, not an editing problem. The
machine thread pane does not need per-message editor islands when the user is
only reading, selecting, copying, or exporting the history.

## Goals

1. Let the user drag-select text across the full visible machine conversation.
2. Give `/machines` a plain markdown transcript format that is readable without
   custom Noter-only hidden markers.
3. Make the machine thread surface and future file/export surfaces share one
   visible document format.
4. Include the message metadata that the current machine-thread model already
   exposes without inventing new message fields.
5. Preserve the existing machine shell header, status messaging, and composer
   outside the transcript body.
6. Keep grouped work and tool activity in the transcript instead of dropping it
   on the floor.

## Non-Goals

1. Editing machine transcripts in place.
2. Replacing the higher-integrity editable history model proposed in
   `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`.
3. Preserving the current user bubble layout inside the transcript body.
4. Defining a generic Markdown standard for chats outside Noter.
5. Adding message metadata that the current browser model does not already
   carry.

## Locked Product Decisions

1. The `/machines` history pane becomes one markdown document rendered through a
   single read-only markdown surface rather than one `ProsemarkReadOnly` per
   message.
2. Message and work boundaries are visible headings, not HTML comments, not raw
   thematic breaks, and not hidden data attributes.
3. The reserved level-2 section headings are exact text matches:
   - `@user`
   - `@assistant`
   - `@work`
4. The heading itself carries the role or section category. The message body
   remains ordinary markdown below it.
5. Metadata that already exists in the current machine-thread JSON may appear
   directly in markdown as a reserved bullet list immediately below the heading.
6. The transcript format is read-only in `/machines`. Parsing markdown back into
   machine-thread state is explicitly out of scope for this slice.
7. Copy/download/export must reuse the same transcript serializer instead of
   inventing a second markdown shape for downloads.
8. The surrounding `/machines` shell may keep its current header, error bar,
   scroll container, and bottom composer while the history area switches to the
   transcript document.

## Current Browser Data Available

### Thread-level fields

The current browser thread model already exposes these fields and may include
them in exported transcript metadata when useful:

1. `id`
2. `name`
3. `preview`
4. `cwd`
5. `createdAt`
6. `updatedAt`
7. `cliVersion`
8. `modelProvider`
9. `sourceLabel`
10. `status`
11. `gitInfo`
12. `path`
13. `agentNickname`
14. `agentRole`

### Message-level fields

The current browser message model does **not** have a rich first-class message
schema. The reliable message metadata available today is:

1. `item.id`
2. `item.type`
3. `item.summary`
4. the containing `turn.id`
5. the message body derived from:
   - `item.raw.text`
   - `item.raw.content[].text`
   - `item.summary` as a fallback

The current browser model does **not** expose a stable per-message timestamp.
This spec therefore does not require message timestamps in transcript metadata.

## Source Of Truth Files

- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
- `apps/noter/src/components/StaticMarkdownDocument.tsx`
- `apps/noter/src/lib/codexThreadTimeline.ts`
- `apps/noter/src/lib/codexAppServerResearch.ts`

## Transcript Format

### Thread-level document block

For copy/export/download, a transcript may start with an optional document title
and thread metadata block:

```md
# Fix selection across machine messages

- thread-id: thread_123
- status: loaded
- cwd: /Users/nicu/dev/my/noter
- updated-at: 2026-04-04T13:40:00.000Z
- model-provider: anthropic
- source-label: Codex
```

The live `/machines` pane may omit this block because the surrounding shell
already renders thread identity above the transcript body.

### Message sections

Each message becomes one reserved level-2 heading followed by an optional
metadata list and then the message body:

```md
## @user

- item-id: item_user_1
- item-type: userMessage
- turn-id: turn_1

It is still not possible to select text across two messages.

## @assistant

- item-id: item_assistant_1
- item-type: assistantMessage
- turn-id: turn_1

We should render the history as one markdown transcript so the browser sees a
single text flow.
```

Rules:

1. A transcript boundary is only a level-2 heading whose trimmed plain-text
   content is exactly `@user`, `@assistant`, or `@work`.
2. The first consecutive bullet list immediately below a reserved heading is the
   section metadata block when every bullet key is a reserved transcript key.
3. The message body begins after the first blank line following that metadata
   block.
4. If a message has no metadata, the body begins immediately after the heading
   and blank line.
5. The serializer must preserve ordinary markdown inside the message body.
6. If the message body itself contains a heading that would exactly collide with
   a reserved section marker, the serializer must escape that boundary text so
   it remains visible without becoming a transcript delimiter.

### Work sections

Grouped non-message timeline entries remain visible in the transcript as one
`## @work` section with one level-3 subsection per grouped entry:

```md
## @work

### Command

- item-id: item_command_1
- item-type: commandExecution
- tone: tool
- preview: pnpm exec vitest run
  apps/noter/src/components/MachinesWorkspaceThreadPane.test.tsx

### File changes

- item-id: item_file_change_1
- item-type: fileChange
- tone: tool
- changed-file: apps/noter/src/components/MachinesWorkspaceThreadPane.tsx
- changed-file: apps/noter/src/lib/codexThreadTimeline.ts
```

Rules:

1. Consecutive grouped work entries remain grouped as one `@work` section,
   matching the current timeline contract.
2. Each grouped entry becomes a level-3 heading whose text is the current work
   title.
3. Work-entry metadata is represented with the same reserved bullet-list
   pattern.
4. Repeated `changed-file` keys are allowed and preserve the current grouped
   file-change summary without requiring nested markdown lists.

### Reserved metadata keys

The transcript serializer may only emit the following reserved keys in v1.

#### Thread metadata keys

1. `thread-id`
2. `status`
3. `cwd`
4. `updated-at`
5. `model-provider`
6. `source-label`
7. `path`
8. `agent-role`
9. `agent-nickname`

#### Message metadata keys

1. `item-id`
2. `item-type`
3. `turn-id`

#### Work-entry metadata keys

1. `item-id`
2. `item-type`
3. `tone`
4. `preview`
5. `changed-file`

The role itself is not duplicated as metadata because the reserved heading
already carries it.

## Rendering Contract

### `/machines` pane

The selected-thread pane should:

1. serialize the selected thread timeline into one markdown transcript string
2. render that transcript through one `StaticMarkdownDocument` surface
3. keep the existing outer shell header and bottom composer
4. stop mounting separate read-only editors for each message body

Because the transcript is a single DOM document instead of multiple editor
roots, browser selection should be able to extend across message boundaries in
one drag gesture.

### Export and copy

Any future `Copy transcript` or `Download markdown` action must use the same
serializer as the live `/machines` transcript so the downloaded file matches the
visible document structure.

## Relationship To Editable History

`specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md` is still the right place for an
editable, versioned chat source of truth.

This transcript spec does **not** compete with that model. It is a read-only
presentation and export format for machine-local thread history, where the
current user need is:

1. select the whole conversation easily
2. copy readable markdown
3. align `/machines` with file-facing transcript surfaces

## Validation

1. Add serializer tests that cover:
   - user and assistant section headings
   - reserved metadata lists
   - grouped work-section serialization
   - reserved-heading collision escaping inside message bodies
2. Add a route-level or honest production-component repro that verifies text can
   be selected across two consecutive message sections in `/machines`.
3. Keep existing machine-thread and transcript rendering coverage green after
   the history pane switches off per-message `ProsemarkReadOnly` instances.

## Implementation Notes

Primary files expected to change in the first implementation slice:

1. `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
2. `apps/noter/src/components/StaticMarkdownDocument.tsx`
3. `apps/noter/src/lib/codexThreadTimeline.ts`
4. `apps/noter/src/lib/codexThreadTranscriptMarkdown.ts`
5. `apps/noter/src/components/MachinesWorkspaceThreadPane.test.tsx`
6. `apps/noter/e2e/machines-workspace-visual.spec.ts`
