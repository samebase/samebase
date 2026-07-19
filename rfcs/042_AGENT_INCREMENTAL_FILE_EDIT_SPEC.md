# Agent Incremental File Edit Specification

## Document Control

- Status: Proposed
- Owner: Noter chat/agent + editor collaboration
- Last updated: 2026-03-06
- Related specs:
  - `rfcs/023_AGENT_GRAPH_CHAT_INTEGRATION_SPEC.md`
  - `rfcs/037_EDITOR_COMMIT_DIFF_RELIABILITY_SPEC.md`
  - `rfcs/020_CONVEX_AGENT_ADOPTION_SPEC.md`

## Summary

Add a new AI tool for localized file edits without replacing the entire file.

The existing `edit_file` tool remains unchanged and continues to support full-file replacement. The
new tool, `replace_in_file`, is the default edit primitive for targeted changes.

`replace_in_file` is model-facing and human-debuggable. Internally, successful replacements compile
into CodeMirror `ChangeSet` updates so Noter continues to use the same collaborative editing
substrate already used by the editor.

## Goals

- Reduce token cost for localized edits.
- Make AI edit payloads easier to inspect than full-file replacement.
- Reuse Noter's existing collaborative editing pipeline instead of inventing a second edit backend.
- Preserve real-time editor updates for open files.
- Keep the current `edit_file` fallback for large rewrites and generated files.

## Non-Goals

- Replacing the current `edit_file` tool.
- Introducing a model-facing unified diff or raw CodeMirror `ChangeSet` tool in v1.
- Changing collaborative undo semantics in v1.
- Supporting regex-based edits in v1.
- Supporting line-number-based edit contracts in v1.

## Current State

### Existing AI file tools

The current tool surface is defined in:

- `apps/noter/convex/agent/toolCatalog.ts`
- `apps/noter/convex/agent/tools.ts`

For existing files, `edit_file` currently expects:

```json
{
  "path": "relative/path/to/file.ts",
  "content": "full new file contents"
}
```

This works but is expensive and produces noisy raw payloads for small changes.

### Existing collaborative editing standard

Noter already has a concrete collaborative editing protocol:

- `fileStaging.version` stores the current document version.
- `vaultStagedFileUpdates.changes` stores serialized CodeMirror `ChangeSet` JSON.
- Editors send `changes.toJSON()` to Convex.
- Convex reconstructs updates with `ChangeSet.fromJSON(...)`.

This is the correct internal standard to preserve.

## Decision

Add a new tool:

- `replace_in_file`

Keep these existing tools as-is:

- `edit_file`
- `create_file`
- `delete_file`

`replace_in_file` becomes the preferred tool for localized edits to existing files.

## Why This Contract

### Why not full-file replacement

- It wastes tokens on unchanged content.
- It obscures the actual intended change.
- It makes it harder to later support explicit AI revert behavior.

### Why not raw CodeMirror `ChangeSet`

- It is the right storage/sync format, but the wrong model-facing format.
- It is position-based rather than intent-based.
- It is hard for a model to author directly and hard for humans to debug.

### Why not line/range edits

- Line/character offsets are brittle when content drifts.
- The model already reasons better in exact text snippets than in cursor math.
- Exact-text replacements still map cleanly to resolved ranges internally.

### Why exact search/replace

- This matches the most successful existing agent editing pattern for current model families.
- It is concise and debuggable.
- It lets the backend fail safely when a change is ambiguous.
- It compiles naturally into a minimal `ChangeSet`.

## Tool Contract

### Name

- `replace_in_file`

### Description

Use this tool to make localized edits to an existing file by replacing exact text snippets. Prefer
this over `edit_file` when changing one or more specific sections of a file. Each `oldText` must
appear exactly once in the current file content. Include exact whitespace and indentation. If a
replacement is ambiguous or not found, the tool will fail. Use `edit_file` only when rewriting most
or all of the file.

### Input schema

```ts
type ReplaceInFileInput = {
  path: string;
  replacements: Array<{
    oldText: string;
    newText: string;
  }>;
};
```

### Example input

```json
{
  "path": "src/components/ChatFab.tsx",
  "replacements": [
    {
      "oldText": "const isEnabled = false;\n",
      "newText": "const isEnabled = true;\n"
    },
    {
      "oldText": "label: \"Disabled\",\n",
      "newText": "label: \"Enabled\",\n"
    }
  ]
}
```

### Default matching rules

- `path` is required and must reference an existing file.
- `replacements` is required and must contain at least one replacement.
- Each replacement must include non-empty `oldText`.
- `newText` may be empty to represent deletion.
- Each `oldText` must match exactly once in the source snapshot used for the tool call.
- Matching is exact, including whitespace, indentation, and line endings after normalization.
- All replacements are resolved against the original source snapshot at tool start, not against
  previously applied replacements in the same call.
- Replacements must not overlap.
- If the model needs dependent/chained edits, it should make multiple tool calls.

### Explicitly unsupported in v1

- Regex patterns
- Replace-all semantics
- Optional fuzzy matching
- Model-authored line/range offsets
- Cross-file multi-edit batches

## Source Snapshot Rules

`replace_in_file` resolves against the same content source the current AI tools use:

1. If the file already exists in `vaultStagedFiles`, use staged content.
2. Otherwise, read repository content for the current branch/path.

This preserves the existing Noter behavior where staged edits are the live working copy seen by the
agent.

## Execution Algorithm

### 1. Resolve source content

- Load staged content if present.
- Otherwise load repository content.
- If the file does not exist, fail and instruct the model to use `create_file`.

### 2. Resolve replacements

For each replacement:

- Find exact matches of `oldText` in the original source snapshot.
- Require exactly one match.
- Record `from` and `to` offsets.

After all replacements are resolved:

- Sort by `from`.
- Validate no overlap.

### 3. Build a minimal edit set

- Convert resolved replacements into CodeMirror-compatible changes.
- Build a `ChangeSet` from the resolved offsets and replacement text.
- Apply the `ChangeSet` to the source snapshot to produce final content.

### 4. Persist through the collaborative pipeline

If the file is already staged/open:

- Insert a `vaultStagedFileUpdates` row with serialized `ChangeSet` JSON.
- Increment `fileStaging.version`.
- Update staged content by applying the same `ChangeSet`.

If the file is not yet staged:

- Create or update the `vaultStagedFiles` row with the final content.
- Preserve the existing initial content and branch metadata.
- Starting version remains `0` unless a collaborative stream already exists.

### 5. Return structured debug output

The tool output should include a structured summary of what matched and what was applied.

Suggested shape:

```json
{
  "path": "src/components/ChatFab.tsx",
  "applied": 2,
  "resolvedEdits": [
    {
      "startLine": 12,
      "startCharacter": 0,
      "endLine": 12,
      "endCharacter": 25
    },
    {
      "startLine": 28,
      "startCharacter": 6,
      "endLine": 28,
      "endCharacter": 24
    }
  ],
  "result": "File edited: src/components/ChatFab.tsx"
}
```

The chat UI may continue showing the raw input payload for debugging. A richer rendered diff can be
added later without changing the tool contract.

## Failure Semantics

The tool must fail without partial application when any of the following are true:

- the file does not exist
- `replacements` is empty
- any `oldText` is empty
- a replacement matches zero times
- a replacement matches more than once
- two replacements overlap
- the file is marked deleted in staging

Suggested error messages:

- `replace_in_file failed: src/foo.ts does not exist; use create_file`
- `replace_in_file failed: replacement 1 did not match any text`
- `replace_in_file failed: replacement 2 matched multiple locations; include more surrounding context`
- `replace_in_file failed: replacements 1 and 2 overlap`

The agent should be able to recover from these errors by reading the file again and retrying with
more specific context.

## Tool Selection Guidance

### Prefer `replace_in_file` when

- editing a few lines or a few regions of an existing file
- inserting text near an existing anchor
- deleting or renaming localized text
- preserving the rest of the file exactly

### Prefer `edit_file` when

- rewriting most of the file
- generating a file from scratch based on the current one
- performing a transformation that would require many dependent replacements

### Prefer `create_file` when

- the file does not exist yet

## Undo and Revert Semantics

This spec does not change default keyboard undo behavior.

Initial behavior:

- user `Ctrl+Z` / undo remains scoped to the local editor history model
- AI edits are treated as collaborative/remote updates, not local keystrokes

This tool is intentionally designed to make explicit AI revert possible later:

- each successful tool call can store the forward `ChangeSet`
- the backend can derive an inverse `ChangeSet`
- later edits can map those inverse changes forward before revert

That future capability is easier with minimal incremental edits than with whole-file replacement.

## Telemetry and Debugging

For backend logs, record:

- tool name
- file path
- replacement count
- whether the file was already staged
- resolved range count
- failure reason if any

For chat/debug surfaces, preserve:

- raw input payload
- structured result payload

Do not log full file contents outside existing debugging patterns unless explicitly needed.

## Implementation Outline

### Tool catalog and prompting

- Add `replace_in_file` to `TOOL_CATALOG`.
- Update system prompt/tool instructions to prefer `replace_in_file` for localized edits.
- Keep `edit_file` documentation unchanged except for clarifying it is the fallback for full
  rewrites.

### Backend execution

- Add a new executor in `apps/noter/convex/agent/tools.ts`.
- Add an internal helper in `apps/noter/convex/collaborative.ts` to apply a precomputed incremental
  `ChangeSet` from the agent.
- Reuse existing staging creation and branch handling behavior.

### UI/debugging

- No UI redesign required for v1.
- Existing tool activity UI can continue to show raw input and output.
- A later improvement may render resolved edits or diffs in a friendlier format.

## Acceptance Checklist

- [ ] `replace_in_file` exists in the agent tool catalog.
- [ ] The agent prefers `replace_in_file` for localized edits.
- [ ] Successful tool calls update open editors in real time.
- [ ] Successful tool calls on closed files create/update staging correctly.
- [ ] Ambiguous or missing matches fail without partial writes.
- [ ] The current `edit_file` tool remains supported and unchanged.
- [ ] Raw tool payloads remain visible in chat for debugging.

## References

- Anthropic text editor tool:
  [https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool)
- Claude Code tools/settings:
  [https://docs.anthropic.com/en/docs/claude-code/settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- CodeMirror collaborative editing example:
  [https://codemirror.net/examples/collab/](https://codemirror.net/examples/collab/)
- CodeMirror `ChangeSet` reference:
  [https://codemirror.net/docs/ref/#state.ChangeSet](https://codemirror.net/docs/ref/#state.ChangeSet)
- Aider edit formats:
  [https://aider.chat/docs/more/edit-formats.html](https://aider.chat/docs/more/edit-formats.html)
