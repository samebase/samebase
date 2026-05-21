# Idea: Evaluate MDXEditor for `.mdx` in Noter

Link: https://mdxeditor.dev/editor/demo

## Context (Noter today)

- Noter uses CodeMirror 6 for the collaborative editor.
- For markdown-ish files we currently use `@prosemark/core` (Lezer markdown + UX extensions).
- We already have Monaco for code files and it can be used as a "always-the-source" escape hatch.

Practical pain point for `.mdx`:

- "Markdown inside JSX wrapper" is MDX-valid, but many Markdown parsers treat `<Tag>...</Tag>` as an
  HTML block.
- When that happens, things like `- [ ] task` inside the wrapper stop being parsed as a task list
  item (it becomes plain text inside HTML).

## What MDXEditor is

MDXEditor is an open-source React component for WYSIWYG authoring of markdown/MDX.

Key properties:

- It accepts/emits markdown as a string (no intermediate HTML model).
- Rich-text engine: Lexical.
- Markdown processing: MDAST-based import/export visitor pipeline (plugins extend import/export
  visitors).

Docs:

- Overview: https://mdxeditor.dev/editor/docs/overview
- Extending the editor (Gurx + visitors): https://mdxeditor.dev/editor/docs/extending-the-editor

## Why it’s relevant to Noter

MDXEditor solves "MDX is not Markdown" by modeling MDX/JSX/directives as first-class nodes instead
of trying to make a Markdown tokenizer behave like an MDX parser.

It also explicitly supports a "source mode" toggle, which matches the "always direct access to
source" constraint.

## Features that map well to our goals

### 1. Source/diff mode (escape hatch)

MDXEditor can switch between rich-text and source/diff mode via `diffSourcePlugin`.

- Docs: https://mdxeditor.dev/editor/docs/diff-source
- API: https://mdxeditor.dev/editor/api/functions/diffSourcePlugin
- Notable: the source editor is CodeMirror-based and can accept extra CodeMirror extensions via
  `codeMirrorExtensions`.

This is conceptually similar to `view | code` and also similar to how we already use Monaco as an
escape hatch.

### 2. JSX support via descriptors (not "execute arbitrary code")

The `jsxPlugin` supports MDX JSX elements using a registry of allowed components
(`JsxComponentDescriptor`), with:

- inline vs block components (`kind: "text" | "flow"`)
- typed props (`string` vs `{expression}`)
- optional nested markdown children editors (via `NestedLexicalEditor`)

Docs:

- https://mdxeditor.dev/editor/docs/jsx
- API: https://mdxeditor.dev/editor/api/interfaces/JsxComponentDescriptor

This matches the "JSX islands can do anything, but the editor stays linear" mental model, as long as
we keep a strict allowlist.

### 3. Directives as a safer alternative to full JSX

MDXEditor has directive support with custom editors and nested markdown.

- https://mdxeditor.dev/editor/docs/custom-directive-editors

This aligns with the existing Noter idea of "MDX-like function calls" (`@code(...)...@end`) without
requiring general JSX parsing/execution.

### 4. Error handling + HTML suppression

MDXEditor explicitly calls out that MDX/HTML-ish parsing can cause parse failures and provides:

- `onError` for diagnostics
- `suppressHtmlProcessing` to disable mdast-util-mdx-jsx in the parser (at the cost of losing
  HTML-ish formatting)
- diff/source mode as a recovery path

Docs: https://mdxeditor.dev/editor/docs/error-handling

That `suppressHtmlProcessing` knob is closely related to the Lezer-markdown idea of disabling
`HTMLBlock`/`HTMLTag` parsing when it gets in the way of `.mdx` semantics.

## Integration options for Noter (ideas, not decisions)

### Option A: Keep CodeMirror/ProseMark for collaboration, improve `.mdx` parsing

- Keep current collaborative text model.
- For `.mdx`, consider a parser config that avoids treating JSX as `HTMLBlock` so markdown remains
  parseable.
- Provide an explicit `view | code` toggle:
  - `view`: ProseMark rendering (optionally with "directive/function blocks")
  - `code`: Monaco (raw `.mdx`)

Pros: minimal stack changes; keeps collab as-is. Cons: not "true MDX"; tradeoffs around HTML
parsing/highlighting.

### Option B: Use MDXEditor for `.mdx` editing (non-collab first)

- Treat `.mdx` as a special editor mode that is not collaborative at first.
- Rely on source mode for power users and recovery.
- Keep Monaco available for raw editing.

Pros: closest to true MDX semantics and JSX/directive UX. Cons: collaboration would require a
separate sync model than our current CodeMirror OT approach.

### Option C: Hybrid: Monaco/CodeMirror is the editor, MDXEditor is a "structured sidecar"

- Editing stays in a text editor (Monaco or CodeMirror) for stability + collaboration.
- A side panel renders a structured view using a safe MDX pipeline, with very constrained edits:
  - e.g. directive editors, table editor, frontmatter editor, etc.
- Applying an edit becomes a text patch to the source.

Pros: keeps collab model; still gets better authoring UX for specific constructs. Cons: more complex
mapping between UI edits and source ranges.

### Option D: Avoid full MDX; implement "MDX-like blocks" in Markdown

- Lean into function-call/directive blocks (example in `TODO.md`).
- Keep ProseMark/CodeMirror as the editor, but introduce block-level nodes that render nicely and
  round-trip to text.

Pros: safe and deterministic; works with current collab. Cons: incompatible with arbitrary MDX;
requires choosing a new syntax.

## Open questions (for later)

- Do we need real-time collaboration for `.mdx` rich editing, or is "code collab + view-only
  preview" enough?
- Should `.mdx` default to Monaco (code) with a "view" preview, or default to a rich editor with a
  "code" escape hatch?
- Do we want JSX at all, or should directives/function blocks be the only "interactive" surface?
