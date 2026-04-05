# 080 Machines Transcript Rendering Spec

## Document Control

- Status: Accepted implementation plan
- Owner: connected machine transcript surface
- Last updated: 2026-04-06
- Related docs:
  - `specs/077_CONNECTED_MACHINE_MAIN_THREAD_SURFACE_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`
  - `research/2026-04-06-machines-transcript-rendering-research.md`

## Summary

The `/machines` thread history should stop depending on multiple read-only
editor roots and instead render as one selectable transcript DOM flow.

The product goal is not "use ProseMark everywhere". The actual goal is:

1. let the user select and copy the whole conversation in one drag gesture
2. keep the transcript readable as source
3. keep the transcript visually expressive enough to feel like a conversation,
   not a flattened debug dump

The recommended format is explicit React-flavored transcript source such as:

```mdx
<Message
  from="user"
  itemId="item_user_1"
  itemType="userMessage"
  turnId="turn_1"
>
  Why can't I select across this whole conversation?
</Message>

<Message
  from="assistant"
  itemId="item_assistant_1"
  itemType="assistantMessage"
  turnId="turn_1"
>
  Because the current UI mounts multiple read-only editor roots instead of one
  selectable transcript flow.
</Message>
```

That source should be rendered in `/machines` through a non-editor transcript
renderer that looks close to ProseMark, stays one DOM tree for selection, and is
free to style messages with Tailwind and transcript-specific CSS.

## Problem Statement

Today `/machines` renders each message body through its own `ProsemarkReadOnly`
surface. That makes cross-message text selection brittle because each message is
its own editor island.

The user need is read-only:

1. inspect a machine-local conversation
2. drag-select across the whole thread
3. copy or download a transcript that resembles what the UI shows

This is not an editing requirement. The thread history pane does not need to be
an editable transcript surface for this slice.

## Research Conclusions

### Markdown and MDX

1. CommonMark allows raw HTML blocks, so HTML-like transcript wrappers are a
   valid source format when we want visible structure in source.
2. MDX supports JSX, custom components, and compiler plugins. That makes
   `<Message from="assistant">...</Message>` a valid canonical transcript shape
   when we intentionally want React-flavored source.
3. MDX is acceptable for this product surface because the source is authored by
   Noter and trusted machine-local flows. We are not building a generic
   untrusted MDX execution surface in this slice.

### Tailwind and CSS

1. Tailwind can style transcript wrappers directly through literal utility
   classes or through `data-*` selectors and variants.
2. The current repo Tailwind config only scans `ts` and `tsx` files, so any
   classes authored inside transcript `.md` or `.mdx` files would require
   updated content globs, explicit source registration, or a safelist.
3. Transcript styling should prefer stable wrapper classes or `data-*`
   attributes over dynamically constructed utility strings.

### Current repo constraints

1. The current repo treats `.mdx` as part of the Markdown parser path in the
   CodeMirror/ProseMark language selection code. `.mdx` is therefore not yet a
   live MDX runtime in the current editor path.
2. The current repo already has two non-editor precedents worth reusing:
   - `StaticMarkdownDocument` for a controlled markdown subset
   - `landingCopyShell` for a DOM surface that looks like ProseMark without
     being an editor
3. Because the current user need is read-only selection, a non-editor transcript
   renderer is a better fit than forcing MDX execution inside ProseMark.

## Goals

1. Let the user select across the full visible machine conversation.
2. Make the transcript source honest and readable instead of hiding structure in
   invisible delimiters.
3. Let the rendered transcript look like messages while remaining one selectable
   DOM tree.
4. Keep `/machines`, copy/export, and future file-facing transcript views
   aligned on one source format.
5. Include only metadata that the current machine-thread model actually exposes.
6. Preserve the surrounding `/machines` shell, header, and composer behavior.

## Non-Goals

1. Editing the machine transcript in place.
2. Building a generic untrusted MDX execution surface.
3. Replacing the long-term editable history model in
   `specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md`.
4. Preserving the exact current per-message ProseMark implementation.
5. Inventing metadata that does not already exist in the current thread model.

## Locked Product Decisions

1. The key requirement is whole-conversation selection, not editor parity.
2. `/machines` should render one selectable transcript DOM flow instead of many
   read-only editor roots.
3. The live transcript renderer may look like ProseMark without actually being
   ProseMark.
4. The canonical source should be explicit and React-flavored:
   `<Message from="user|assistant">...</Message>`.
5. Message metadata that already exists may live directly in the transcript
   source as component props instead of hidden comments or out-of-band sidecars.
6. Work and tool activity should remain visible in the transcript, using the
   same explicit component strategy instead of being dropped.
7. Copy/download/export should reuse the same serializer contract as the live
   transcript source.
8. The `/machines` history area may adopt a rendered transcript view while the
   surrounding shell stays unchanged.

## Current Browser Data Available

### Thread-level fields

The current browser thread model already exposes these fields and may use them
for thread-level transcript metadata when useful:

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

The current browser message model does not have a rich first-class message
schema. The reliable message metadata available today is:

1. `item.id`
2. `item.type`
3. `item.summary`
4. the containing `turn.id`
5. the message body derived from:
   - `item.raw.text`
   - `item.raw.content[].text`
   - `item.summary` as a fallback

The current browser model does not expose a stable per-message timestamp, so the
transcript format does not require message timestamps in v1.

## Recommended Transcript Source Format

### Message blocks

The canonical transcript source should use explicit message components:

```mdx
<Message
  from="user"
  itemId="item_user_1"
  itemType="userMessage"
  turnId="turn_1"
>
  It is still not possible to select text across two messages.
</Message>

<Message
  from="assistant"
  itemId="item_assistant_1"
  itemType="assistantMessage"
  turnId="turn_1"
>
  We should render the history as one selectable transcript flow instead of
  multiple editor roots.
</Message>
```

Rules:

1. `from` is required and currently limited to `user` or `assistant`.
2. `itemId`, `itemType`, and `turnId` are optional props that map directly to
   currently available browser metadata.
3. The message body remains ordinary markdown/MDX children inside the component.
4. The source format is intentionally visible and explicit. It should not rely
   on hidden HTML comments as the canonical message boundary.

### Work blocks

Grouped work or tool activity should also stay explicit:

```mdx
<Work
  title="Command"
  itemId="item_command_1"
  itemType="commandExecution"
  tone="tool"
>
  pnpm exec vitest run
  apps/noter/src/components/MachinesWorkspaceThreadPane.test.tsx
</Work>

<Work
  title="File changes"
  itemId="item_file_change_1"
  itemType="fileChange"
  tone="tool"
  changedFiles={[
    'apps/noter/src/components/MachinesWorkspaceThreadPane.tsx',
    'apps/noter/src/lib/codexThreadTimeline.ts',
  ]}
/>
```

The exact work component spelling may evolve during implementation, but the
product decision is fixed: non-message transcript entries stay explicit in
source rather than being flattened into anonymous text.

### Thread-level metadata

The live `/machines` pane may keep thread identity in the surrounding shell
instead of duplicating it in the transcript body. Export and download flows may
prepend thread-level metadata when useful.

## Rendering Contract

### Live `/machines` view

The selected-thread pane should:

1. serialize the selected thread timeline into one canonical transcript source
2. render that source through one non-editor transcript document surface
3. keep the existing outer shell header and bottom composer
4. stop mounting separate read-only editors for each message body

The renderer should produce one DOM tree for the whole transcript so browser
selection can cross message boundaries naturally.

### Selection-triggered source behavior

The product must not expose a user-facing transcript mode toggle for this slice.

Instead:

1. the default presentation should be the rendered message-like transcript view
2. source-shaped transcript behavior should activate automatically when the user
   starts selecting text, matching the spirit of how ProseMark reveals more
   source-like behavior during selection
3. both the rendered and source-shaped selection behavior must derive from the
   same canonical transcript source

### Height parity

Because source-shaped behavior is selection-triggered instead of manually
toggled, the surface must preserve block heights as closely as practical so the
conversation does not jump unexpectedly while the user is dragging a selection.

The renderer may use a hidden pretext or other measurement layer derived from
the canonical source to reserve matching space between the two presentations.
That parity exists to protect read-only selection, scrolling, and copy/paste
stability. It does not imply editable transcript rendering.

## Styling Contract

1. The rendered transcript may use Tailwind and transcript-specific CSS to
   differentiate user, assistant, and work blocks.
2. The transcript should preserve an intentional connection to the existing
   ProseMark visual language so it still feels native to Noter.
3. The visible source may intentionally expose component names such as
   `<Message>` as part of the product's transparency and developer-facing
   storytelling.
4. Styling should rely on literal classes or stable attributes rather than
   dynamically constructed Tailwind class names.

## Relationship To Editable History

`specs/031_GIT_BACKED_CHAT_HISTORY_SPEC.md` remains the right place for
editable, versioned chat history.

This transcript spec is narrower. It solves the current machine-thread need:

1. select the whole conversation easily
2. copy a readable transcript
3. align `/machines` with future file-facing transcript surfaces
4. render that transcript in a way that can look like messages without
   reintroducing multiple editor roots

## Source Of Truth Files

- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
- `apps/noter/src/components/StaticMarkdownDocument.tsx`
- `apps/noter/src/lib/landingCopyShell.ts`
- `apps/noter/src/lib/codexThreadTimeline.ts`
- `apps/noter/src/lib/codexAppServerResearch.ts`
- `apps/noter/src/lib/codemirrorLanguage.ts`
- `apps/noter/tailwind.config.js`

## Validation

1. Add transcript serializer tests for explicit message and work component
   blocks.
2. Add route-level or honest production-component coverage that verifies text
   can be selected across two consecutive rendered transcript blocks in
   `/machines`.
3. Validate that the rendered transcript remains one DOM flow instead of
   multiple editor roots.
4. Validate any source-shaped vs rendered transcript toggle against height
   stability expectations.

## Implementation Notes

Primary files expected to change in the first implementation slice:

1. `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
2. `apps/noter/src/components/StaticMarkdownDocument.tsx` or a new dedicated
   transcript renderer
3. `apps/noter/src/lib/codexThreadTranscriptMarkdown.ts`
4. `apps/noter/src/lib/codexThreadTimeline.ts`
5. `apps/noter/src/index.css`
6. `apps/noter/tailwind.config.js`
7. `apps/noter/src/components/MachinesWorkspaceThreadPane.test.tsx`
