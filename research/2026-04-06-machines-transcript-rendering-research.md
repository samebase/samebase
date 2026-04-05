# 2026-04-06 Machines Transcript Rendering Research

## Question

How should `/machines` represent and render a full conversation so users can
select and copy across the whole transcript, while still letting the surface
look like messages and stay close to Noter's editor language?

## Research Summary

The main problem is not "multiple React components". The real problem is
multiple read-only editor roots. Browser selection can span many normal DOM
nodes just fine, but it gets awkward across separate editor islands.

That makes the strongest direction:

1. one canonical transcript source
2. one rendered transcript DOM flow
3. zero dependence on multiple read-only editor roots for history display

## External Findings

### CommonMark

CommonMark allows raw HTML blocks in markdown, so visible HTML-like wrappers are
valid source syntax when we want explicit message structure in the file itself.

Source:

- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)

### MDX

MDX supports JSX, custom components, and compiler plugins. That makes transcript
source such as `<Message from="assistant">...</Message>` technically valid and
gives us a clean way to express message boundaries in visible source.

Relevant docs:

- [MDX Getting Started](https://mdxjs.com/docs/getting-started/)
- [MDX Components](https://mdxjs.com/table-of-components/)
- [Extending MDX](https://mdxjs.com/docs/extending-mdx/)

Important note: MDX is a programming language. The safety concern is much lower
for this use case because the content is authored inside Noter and trusted
machine-local flows, not arbitrary third-party uploads.

### Tailwind

Tailwind can style transcript wrappers with literal classes or with `data-*`
selectors and variants.

Relevant docs:

- [Tailwind data attributes](https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes)
- [Tailwind detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files)

Important note: Tailwind only generates classes it can statically find in
registered source files, so markdown- or MDX-authored classes need scanning or
safelisting support.

## Repo Findings

### Current `/machines` problem

`/machines` history currently depends on separate `ProsemarkReadOnly` roots per
message in the shipped implementation lineage. That is the behavioral reason
cross-message selection feels broken.

Relevant files:

- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
- `apps/noter/src/components/ProsemarkReadOnly.tsx`

### `.mdx` is not currently a live MDX runtime here

The current repo routes `.mdx` through the markdown parser path in CodeMirror.
That means a `.mdx` transcript does not automatically become rendered React
components inside the current editor pipeline.

Relevant files:

- `apps/noter/src/lib/codemirrorLanguage.ts`
- `apps/noter/src/lib/codemirrorLanguage.test.ts`

### Existing non-editor precedents already exist

The repo already has useful precedents for a rendered DOM surface that looks
editor-adjacent without actually being an editor:

- `apps/noter/src/components/StaticMarkdownDocument.tsx`
- `apps/noter/src/lib/staticMarkdown.ts`
- `apps/noter/src/lib/landingCopyShell.ts`
- `apps/noter/src/index.css`

These are strong signs that a transcript-specific renderer is a better fit than
forcing MDX execution inside ProseMark for read-only history.

### Tailwind config constraint

The current Tailwind config only scans `ts` and `tsx` source files.

Relevant file:

- `apps/noter/tailwind.config.js`

That means markdown or MDX transcript files would need updated source detection,
or the renderer should map transcript state to stable wrapper classes that live
in scanned app code.

## Direction Recommendation

### Canonical source

Use explicit React-flavored transcript source:

```mdx
<Message
  from="user"
  itemId="item_user_1"
  itemType="userMessage"
  turnId="turn_1"
>
  Why can't I select across the whole conversation?
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

This is readable, honest about the React model, and can double as a
developer-facing product signal.

### Live rendering

Do not require ProseMark to execute MDX for the read-only transcript surface.
Instead:

1. derive one canonical transcript source
2. render it through one transcript DOM surface
3. style that surface so it still feels close to ProseMark

### Height stability

The product should not expose a manual toggle here. Instead, source-shaped
behavior should appear automatically during text selection, while the default
presentation remains the richer rendered message view.

That makes height stability more important, not less. A hidden pretext or
measurement layer is a reasonable way to reserve matching space and avoid
jarring scroll jumps while a live selection is in progress.

## Conclusion

The best fit is not "one huge ProseMark editor". The best fit is:

1. one canonical transcript source
2. one selectable rendered DOM transcript
3. explicit transcript components such as `<Message from="assistant">`
4. transcript styling that feels editor-native without actually being an editor
