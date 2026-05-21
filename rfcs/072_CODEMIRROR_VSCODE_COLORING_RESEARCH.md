# 072 CodeMirror VS Code-Like Coloring Research

## Document Control

- Status: Draft research
- Owner: Noter frontend/editor
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/components/MonacoEditor.tsx`
  - `apps/noter/src/components/ProsemarkMergeEditor.tsx`
  - `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/convex/fileStagingActions.ts`
  - `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`
- External references:
  - [CodeMirror reference: `LanguageDescription.matchFilename`](https://codemirror.net/docs/ref/#language.LanguageDescription.matchFilename)
  - [CodeMirror reference: `unifiedMergeView`](https://codemirror.net/docs/ref/#merge.unifiedMergeView)

## Question

How hard would it be to make CodeMirror-backed code file surfaces look more like VS Code / Monaco,
given that Noter already routes code files through CodeMirror in diff/compare surfaces even though
normal editing uses Monaco by default?

This research also covers the follow-up question of whether we could later let the operator switch
between Monaco and CodeMirror for code files.

## Short Answer

There are really two different jobs here:

1. make CodeMirror diff/compare surfaces parse code files with the correct language instead of
   treating them as Markdown
2. tune the CodeMirror token colors so they feel closer to Monaco / VS Code

Scoped to diff/compare surfaces only, this looks like a **moderate but very contained change**. It
is likely closer to a localized editor-surface refactor than a platform rewrite.

The bigger project is not coloring. The bigger project is offering **CodeMirror as a first-class
alternative editor for code files**. That would be materially larger because Monaco currently owns
the main code-editing experience and its TypeScript project wiring.

## Verified Current State

### 1. Normal code editing already routes to Monaco

`apps/noter/src/components/CodeEditor.tsx` currently sends non-prose files to `MonacoEditor` and
keeps CodeMirror / ProseMark only for prose-like files:

- prose extensions: `.md`, `.mdx`, `.mdc`, `.txt`, `.markdown`
- everything else: Monaco

`apps/noter/src/components/MonacoEditor.tsx` uses Monaco's built-in themes:

- light: `vs`
- dark: `vs-dark`

It also contains the repo's TypeScript-specific Monaco setup:

- `setupEditorATA(...)`
- extra-lib project syncing
- `tsconfig` parsing and application

That means Monaco is not just a paint choice today. It already owns some language-service behavior
for code files.

### 2. Diff/compare mode already hydrates non-Markdown code files into the rich CodeMirror pipeline

The frontend diff/compare surfaces use `ProsemarkMergeEditor` and `ProsemarkReadOnly` from
`apps/noter/src/components/FileView.tsx`.

The backend explicitly hydrates rich old/new content for non-Markdown text files too:

- `buildCommitPreviewFromStagedFiles(...)` passes `hydrateRichContent: true`
- `buildRemoteComparePreviewFile(...)` passes `hydrateRichContent: true`
- `buildComparedCommitPreviewFileFromStagedFile(...)` passes `hydrateRichContent: true`

That means code files like `src/file.ts` can already land in the same rich diff surface as Markdown
files. This is not theoretical.

### 3. The current CodeMirror rich surfaces are still hard-wired to Markdown parsing

`ProsemarkMergeEditor` and `ProsemarkReadOnly` both create their editor state with:

```ts
markdown({
  codeLanguages: languages,
  extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
});
```

That is correct for Markdown documents, but it means a file like `src/file.ts` is still parsed as a
Markdown document, not as TypeScript.

Important consequence:

- code fences inside Markdown can be syntax-highlighted
- plain code files rendered through these surfaces are not getting true file-language parsing

This is the main reason the diff surface cannot currently look Monaco-like for code files.

### 4. The existing CodeMirror styling foundation is already partially there

This repo already has useful styling primitives:

- `@prosemark/core` installs `baseSyntaxHighlights` and `generalSyntaxHighlights`
- `apps/noter/src/components/prosemarkSurface.ts` applies official `@codemirror/theme-one-dark` in
  dark mode
- `@prosemark/core` ships a light theme with syntax color variables

So the missing piece is not "does CodeMirror know how to color tokens at all". The missing piece is:

1. correct language selection for code files
2. a palette closer to Monaco / VS Code if we want tighter visual parity

### 5. Existing fixtures already exercise a code-file diff rendered through CodeMirror

`apps/noter/src/components/FileViewCompareVisualFixture.tsx` already renders a TypeScript-like
compare file body through `ProsemarkReadOnly`.

That gives a cheap validation target for a future implementation:

- update the fixture to pass the file path
- refresh `apps/noter/e2e/file-view-compare-visual.spec.ts-snapshots/file-view-compare-sidebar.png`

### 6. Recent PR check: no conflicting editor-coloring work, but mobile drag is now an explicit constraint

Reviewed the repo's latest PRs on 2026-03-30, including the most recent editor-adjacent work:

- PR [#384](https://github.com/noter-md/noter/pull/384)
- PR [#383](https://github.com/noter-md/noter/pull/383)
- PR [#381](https://github.com/noter-md/noter/pull/381)
- PR [#382](https://github.com/noter-md/noter/pull/382)
- PR [#380](https://github.com/noter-md/noter/pull/380)
- PR [#378](https://github.com/noter-md/noter/pull/378)

The important result for this RFC is not a competing coloring change. It is that recent
accepted/editor work now makes mobile pane drag an explicit cross-surface contract:

- Monaco mobile pane drag is now accepted in `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`
- ProseMark mobile pane drag is already accepted in
  `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`
- `ProsemarkMergeEditor` and `ProsemarkReadOnly` already use `useProsemarkMobilePaneDrag(...)`

So any implementation that changes the ProseMark diff/read-only stack should preserve that drag
behavior and include it in validation.

## External Findings

### CodeMirror already has the filename-to-language hook we need

The official CodeMirror API provides `LanguageDescription.matchFilename(languages, filename)`.

That is exactly the right primitive for:

- `src/file.ts` -> TypeScript
- `src/file.tsx` -> TSX
- `src/file.py` -> Python
- `README.md` -> Markdown

Local inspection in this repo's installed dependencies shows:

- `@codemirror/language-data` is already installed
- it already carries loaders for common languages, including TypeScript / JavaScript / Python / HTML
  / CSS / JSON / Rust / YAML and others
- matching `src/file.tsx` resolves to a loadable `TSX` language description

So this does **not** look blocked on adding a big new dependency for common languages.

### CodeMirror merge view wants the main editor language to be correct

The official `unifiedMergeView(...)` docs say that deleted chunks are syntax highlighted using the
main editor's language when `syntaxHighlightDeletions: true`.

That means the merge view will improve automatically once the main editor language is file-aware.

This is another reason the work should start with language resolution, not with theme tweaking.

## What "VS Code-Like Coloring" Actually Means

There are three realistic interpretations:

### A. Real syntax highlighting for code files in CodeMirror diff surfaces

This means:

- `export`, `const`, JSX tags, Python keywords, JSON keys, etc. get real language parsing
- deleted lines in merge view benefit from that same language

This is the highest-value part.

### B. Token colors closer to Monaco / VS Code

This means:

- adjust CodeMirror highlight colors to feel closer to `vs` / `vs-dark`
- accept "close enough" parity, not exact token-for-token identity

This is useful, but it is a second layer on top of A.

### C. A real Monaco / CodeMirror editor-mode switch for code files

This means:

- a user-visible setting or toggle
- routing non-prose files to Monaco or CodeMirror on demand
- deciding what feature parity is expected in CodeMirror mode

This is much larger than A or B.

## Options and Estimated Difficulty

### Option A. Add file-aware language support to CodeMirror diff/compare surfaces

Scope:

- keep Monaco as the default code editor
- improve only the CodeMirror surfaces used in diff / compare / review for code files

Likely implementation shape:

1. Add an app-owned helper such as `apps/noter/src/lib/codemirrorLanguage.ts`.
2. Resolve language by filename with `LanguageDescription.matchFilename(languages, filePath)`.
3. Load `LanguageSupport` asynchronously and cache it.
4. Add a `Compartment` to `ProsemarkMergeEditor` and `ProsemarkReadOnly`.
5. For Markdown files, keep the existing Markdown parser.
6. For non-Markdown code/text files, reconfigure the editor to the resolved language support instead
   of Markdown.
7. Pass `selectedFile` into these components from `FileView`.

Expected files:

- new `apps/noter/src/lib/codemirrorLanguage.ts`
- `apps/noter/src/components/ProsemarkMergeEditor.tsx`
- `apps/noter/src/components/ProsemarkReadOnly.tsx`
- `apps/noter/src/components/FileView.tsx`

Assessment:

- Complexity: medium-low
- Risk: low-medium
- Likely size: about 1 focused day, or roughly 0.5 day for the spike plus another 0.5 day for
  cleanup/tests/snapshots

Main risks:

- asynchronous language loading without an ugly flash
- making sure Markdown files keep the current ProseMark behavior
- choosing the right fallback for unknown text files
- preserving the existing ProseMark mobile pane-drag behavior while changing editor configuration

### Option B. Add a Monaco / VS Code-like highlight palette on top of Option A

Scope:

- keep the file-aware parsing from Option A
- replace or override the current CodeMirror token colors for code-oriented surfaces

Likely implementation shape:

1. Add an app-owned `HighlightStyle` for code surfaces, or override the ProseMark syntax color
   variables with a Monaco-like palette.
2. Use a light palette close to Monaco `vs`.
3. Use a dark palette close to Monaco `vs-dark` / VS Code Dark+.
4. Keep Markdown presentation styles intact where possible.

Assessment:

- Complexity: small-medium on top of Option A
- Risk: medium
- Likely size: another 0.5 to 1 day

Important limitation:

Exact parity is unlikely. Monaco and CodeMirror do not share the same parser stack or token
taxonomy, so some tokens will never line up perfectly.

Recommendation:

Treat this as "visually closer to VS Code", not "bit-exact Monaco token parity".

### Option C. Offer a Monaco / CodeMirror switch for code files

Scope:

- let the operator choose CodeMirror or Monaco for code-file editing
- apply that choice outside diff mode too

What makes this bigger:

- `CodeEditorWrapper` currently assumes non-prose files mean Monaco
- the current CodeMirror editor path is prose-oriented, not a generic code-editor surface
- Monaco currently owns TypeScript extra libs, ATA, and `tsconfig` wiring
- a user-facing switch needs persistence, likely in Convex per-user settings

There are two versions of this option:

1. lightweight toggle
   - CodeMirror mode is intentionally simpler than Monaco
   - enough for reading / editing, but no promise of Monaco-level language tooling
2. parity-oriented toggle
   - CodeMirror mode also needs a story for completions, diagnostics, project context, and future
     editor behaviors

Assessment:

- Complexity: medium-high for a lightweight toggle
- Complexity: high for a parity-oriented toggle
- Likely size: 2 to 4 days for a clean lightweight toggle; longer if feature parity is expected

This is the point where the work stops being "coloring" and becomes a product decision about two
supported code editors.

## Recommended Sequence

### Recommendation 1. Start with Option A only

This gives the highest-value result for the smallest amount of code churn:

- code files in compare/review stop looking like plain Markdown paragraphs
- deleted code lines can inherit real language-aware highlighting
- Monaco stays the default editor, so no main-editor regression risk

### Recommendation 2. Only do Option B after Option A is working

If the language is still Markdown, theme work will not solve the core problem.

Correct parser selection should come first. Palette tuning comes second.

### Recommendation 3. Treat Option C as separate product work

Do not fold "editor switch" into the first coloring spike.

That is a different project with different acceptance criteria.

## Concrete Future Validation Plan

The smallest stable validation path looks like:

1. Add unit tests for the language resolution helper.
2. Update `FileViewCompareVisualFixture.tsx` so the code sample passes a file path into
   `ProsemarkReadOnly`.
3. Refresh the file-view compare screenshot to confirm code tokens are visibly different.
4. Optionally add a commit-review fixture for a `.ts` file rendered through `ProsemarkMergeEditor`.
5. Re-run the focused ProseMark mobile-pane unit test if the implementation changes how those
   surfaces mount or reconfigure their editor state.

Likely validation files:

- `apps/noter/src/components/FileViewCompareVisualFixture.tsx`
- `apps/noter/src/components/useProsemarkMobilePaneDrag.test.tsx`
- `apps/noter/e2e/file-view-compare-visual.spec.ts`
- `apps/noter/e2e/file-view-compare-visual.spec.ts-snapshots/file-view-compare-sidebar.png`

## Bottom Line

If we scope this to **CodeMirror diff/compare surfaces for code files**, the work looks very
feasible and reasonably small.

The hard part is not adding color. The hard part is only if we decide to turn CodeMirror into a
user-selectable alternative to Monaco for full code editing.

So the recommended framing is:

1. ship file-aware CodeMirror syntax highlighting in diff/review first
2. optionally tune the palette closer to VS Code after that
3. only then decide whether a real Monaco / CodeMirror switch is worth the extra product and
   editor-runtime complexity
