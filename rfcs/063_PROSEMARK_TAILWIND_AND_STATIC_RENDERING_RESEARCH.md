# 063 ProseMark Tailwind and Static Rendering Research

## Document Control

- Status: Research
- Owner: Noter editor
- Last updated: 2026-03-21
- Related docs:
  - `rfcs/README.md`
  - `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - `apps/noter/src/components/prosemarkSurface.ts`

## Summary

Noter currently uses `@prosemark/core` as a live CodeMirror behavior layer for
markdown editing and read-only rendering inside the editor surface.

Research against a local fork of ProseMark shows that the package can already be
themed, but only through CodeMirror theme extensions, syntax highlighting, CSS
variables, and a small set of hard-coded widget classes. It does not expose a
first-class semantic element styling API, and it does not render markdown to
standalone semantic HTML.

If Noter wants Tailwind-owned styling and faster read-only loading, the clean
path is to split the problem in two:

1. Keep ProseMark for editable surfaces and add configurable semantic
   classes/data attributes in a fork.
2. Add a separate static markdown renderer that emits semantic HTML using the
   same render spec.
3. Use prerendered or cached HTML only for read-only surfaces. Keep CodeMirror
   for editing.

## Why this research exists

Noter wants more control over markdown presentation so Tailwind can own the
visual system. The specific questions were:

1. Can ProseMark be configured cleanly enough to let Noter style markdown with
   Tailwind instead of hand-authored CodeMirror theme objects?
2. Can the same implementation be reused to prerender markdown to HTML for
   faster read-only loading?

## Research Inputs

This note is based on source inspection of the ProseMark fork in local
development, focused on:

- `@prosemark/core` basic setup, hide/fold extensions, widget DOM, and theme
  modules
- `@prosemark/render-html`
- Noter's current ProseMark integration in read-only and editor surfaces

## Findings

### 1. ProseMark is a CodeMirror decoration system, not a semantic HTML renderer

The core package is structured as a set of CodeMirror extensions that:

- hide markdown syntax tokens when the selection is away from them
- replace some markdown ranges with widgets
- add syntax highlighting and theme rules

That architecture is appropriate for WYSIWYM editing, but it is not equivalent
to an HTML renderer.

Important consequences:

- visual output depends on cursor selection state
- some visuals depend on viewport or measured layout
- the DOM is optimized for editor behavior, not semantic output parity

Examples from the current implementation:

- headings are styled through syntax highlighting rather than emitted as `<h1>`
  through `<h6>` elements
- list bullets are replaced by inline widgets
- blockquotes use line decorations and measured offsets
- code fences are decorated line-by-line inside the editor view

### 2. The current styling surface is CSS variables plus fixed widget classes

ProseMark does have a styling system today, but it is aimed at skinning the
editor, not at semantic class ownership.

Current styling mechanisms:

- `EditorView.theme(...)` objects for structural widget styling
- `HighlightStyle.define(...)` rules for inline markdown syntax styling
- CSS variables such as `--pm-link-color`, `--pm-muted-color`,
  `--pm-code-background-color`, and related tokens
- hard-coded widget classes such as `cm-rendered-link`, `cm-inline-code`,
  `cm-rendered-list-mark`, `cm-checkbox`, `cm-image`, `cm-code-block-info`, and
  `cm-html-widget`

What is missing:

- no class-map configuration that lets a consumer say "use these classes for
  inline code, headings, links, task checkboxes, and images"
- no render spec shared between widget DOM and any standalone HTML output
- no default semantic `data-*` attributes that make Tailwind targeting or
  post-processing cleaner
- no option surface on `prosemarkBasicSetup()` or `prosemarkBaseThemeSetup()`
  for swapping the default presentation model

### 3. The editor DOM is not HTML-equivalent markdown

This matters because Tailwind element styling usually assumes real HTML
structure such as `h1`, `p`, `ul`, `li`, `blockquote`, `pre`, and `code`.

ProseMark's editor output is not that structure:

- headings remain editor text nodes with CodeMirror-generated styling
- bullets are `span` widgets, not actual list marker rendering
- task list toggles are editor widgets tied to markdown source positions
- blockquotes are simulated with line decorations and measured borders
- code fence chrome is built from CodeMirror line decorations and widgets

That means the current live editor DOM is not a good source of truth for
prerendered HTML, and it is not a natural fit for Tailwind Typography-style
element selectors.

### 4. `@prosemark/render-html` does not solve static markdown rendering

`@prosemark/render-html` only handles raw HTML blocks inside the editor. It
sanitizes the raw HTML and swaps that markdown range for a widget in the live
CodeMirror view.

It does not:

- render ordinary markdown to HTML
- produce standalone HTML strings for SSR or static generation
- share a general semantic render spec with the rest of the editor output

So it is useful as an in-editor enhancement, but it is not a base for the
"prerender markdown with Tailwind during build" goal.

### 5. Noter already owns part of the presentation layer locally

Noter is not consuming ProseMark as a fully opinionated UI package. It already
adds local behavior and styling on top of the core editor surface:

- `prosemarkSurfaceTheme` normalizes layout and inherited typography
- `ProsemarkReadOnly` adds extra line decoration variants and landing-copy
  styling

This is useful because it means Noter does not need ProseMark to own all
styling. What Noter actually needs from a fork is a better semantic hook
surface, not a full UI redesign in the upstream package.

### 6. Build-time prerendering is not a universal solution for Noter content

Build-time prerendering only applies cleanly to static, shipped content such as:

- landing pages
- docs
- starter-template copy
- fixed marketing or onboarding content

Most vault markdown in Noter is dynamic repository content. That means build
time is the wrong lifecycle for the general case. For vault content, the right
models are:

- request-time SSR
- cached rendered HTML keyed by file SHA or document version
- precomputed HTML stored alongside a known file revision

## Implications for Noter

### 1. Editor theming and static reading should be treated as separate concerns

Trying to make the live CodeMirror DOM double as the prerendered HTML contract
would couple two very different problems:

- editing semantics with selection-sensitive folding/hiding
- read-only semantic rendering for speed and HTML reuse

Those concerns should share a render vocabulary, but not the same runtime DOM.

### 2. A ProseMark fork is justified, but the scope should stay narrow

The fork should focus on editor semantics and shared render metadata, not on
turning the live editor into a full HTML generator.

That keeps the work aligned with ProseMark's actual design instead of fighting
it.

### 3. The first migration target should be read-heavy surfaces

If Noter introduces a static renderer, the immediate performance win is on
read-heavy surfaces, not the editing surface. Candidate targets:

- landing copy
- read-only markdown cards or previews
- starter-template and docs-like views

Editable surfaces should continue using CodeMirror.

## Recommended Direction

### 1. Fork ProseMark to expose semantic styling hooks

Add a first-class render/style configuration layer to the fork. The minimal
version should include:

- stable semantic defaults in addition to the current `cm-*` classes
- optional `data-pm-node` and `data-pm-role` attributes on widgets
- configurable class overrides for widget-backed elements
- a way to opt out of the default base theme without losing editor behavior

Recommended migration guardrail:

- keep dual classes during the initial migration, for example
  `cm-inline-code pm-inline-code`

That preserves compatibility while giving Noter stable selectors that belong to
its own design system.

### 2. Split behavior setup from presentation setup

The current convenience setup should be decomposed so a consumer can adopt
behavior without inheriting the default presentation.

The fork should expose something closer to:

```ts
const prosemarkBehaviorSetup = () => [
  defaultHideExtensions,
  defaultFoldableSyntaxExtensions,
  revealBlockOnArrowExtension,
  clickLinkExtension,
  defaultClickLinkHandler,
  fixedTabWidthExtension,
  softIndentExtension,
  codeBlockDecorationsExtension,
]

const prosemarkPresentationSetup = (renderSpec: ProseMarkRenderSpec) => [
  prosemarkSyntaxHighlighting(renderSpec),
  prosemarkTheme(renderSpec),
]
```

That makes Tailwind ownership much simpler because Noter can decide how much of
the default look to keep.

### 3. Introduce a shared render spec

Add a single shared shape that can be used by both:

- the live editor widget DOM
- a future static HTML renderer

For example:

```ts
type ProseMarkRenderSpec = {
  classes: {
    root?: string
    link?: string
    inlineCode?: string
    listMark?: string
    checkbox?: string
    image?: string
    imageBlock?: string
    blockquoteLine?: string
    blockquoteBorder?: string
    codeFenceLine?: string
    codeFenceHeader?: string
    codeFenceLanguage?: string
    codeFenceCopyButton?: string
  }
  attrs?: {
    widgetDataAttributes?: boolean
  }
}
```

Literal Tailwind class strings can live in this spec if the consuming app wants
that, or Noter can map these semantic names to its own stylesheet via `@apply`.

### 4. Build a separate static renderer

The prerender path should be a separate renderer rather than an attempt to
export the CodeMirror DOM.

That renderer can live either:

- in the ProseMark fork as a new package such as `@prosemark/render-static`, or
- in the Noter repo if the team wants to keep the fork narrower

The renderer should:

- parse markdown with the same markdown syntax extensions that matter for Noter
- emit semantic HTML tags
- apply the same render spec class vocabulary
- support at least headings, paragraphs, lists, task lists, blockquotes, links,
  inline code, code fences, images, emphasis, strong text, strikethrough, and
  horizontal rules

### 5. Prefer cached/SSR rendering for vault content

For repository-backed markdown, prerendering should happen per revision rather
than at product build time.

Recommended model:

1. Treat file content hash or git SHA as the cache key.
2. Render semantic HTML once for that revision.
3. Serve cached HTML for read-only views.
4. Fall back to live ProseMark only when editing is required.

## Proposed Initial Deliverables

### Phase 1: Editor semantics in the fork

1. Add semantic dual classes and `data-pm-*` attributes to widget DOM.
2. Split behavior setup from presentation setup.
3. Add an options surface or render spec for class overrides.
4. Keep current behavior as the default path so migration is incremental.

### Phase 2: Static renderer spike

1. Implement a small semantic renderer for the markdown subset Noter uses most.
2. Reuse the shared render spec for class names.
3. Validate parity on a small Noter fixture set rather than full production
   rollout.

### Phase 3: Noter adoption

1. Use the new semantic class hooks on the editor surfaces.
2. Replace selected read-only CodeMirror views with rendered HTML where load
   time matters.
3. Keep the editing experience on CodeMirror and ProseMark.

## Non-Goals

This research does not recommend:

1. replacing CodeMirror for markdown editing
2. forcing all markdown rendering through build-time generation
3. making ProseMark's live editor DOM the canonical HTML contract
4. expanding the fork with speculative features that Noter does not plan to use
   in the near term

## Open Questions

1. Should the static renderer live in the ProseMark fork or stay local to Noter?
2. Should Noter own literal Tailwind class strings in a render spec, or should
   it map stable semantic classes to Tailwind via app CSS?
3. Which Noter read-only surfaces should migrate first once a renderer exists?
4. How much compatibility should the fork preserve for the existing `cm-*` class
   contract before switching consumers to `pm-*` selectors?

## Recommendation

Proceed with a narrow ProseMark fork that improves semantic styling hooks, but
do not try to stretch the current editor implementation into a general-purpose
HTML renderer.

For Noter, the right long-term architecture is:

1. ProseMark fork for editing semantics and stable style hooks
2. separate semantic HTML renderer for read-only performance
3. Tailwind ownership at the render-spec or app-stylesheet layer
4. revision-keyed caching or SSR for dynamic vault markdown
