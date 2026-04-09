# GitHub Link Style Research

## Status

- Date: April 9, 2026
- Scope: `apps/noter`
- Purpose: Capture the closest public source of truth for GitHub link styling
  before reusing that behavior in Noter's status bar.

## Why This Note Exists

The current status-bar link treatment may want to match GitHub's review and
file-link behavior more closely.

This note preserves the external research so the styling decision does not live
only in chat.

## Public Sources Checked

- [Primer Link component](https://primer.style/product/components/link/)
- [Primer Link accessibility](https://primer.style/product/components/link/accessibility/)
- [Primer color primitives](https://primer.style/product/primitives/color/)
- [Primer typography primitives](https://primer.style/product/primitives/typography/)
- [Primer React `Link` source](https://github.com/primer/react/blob/main/packages/react/src/Link/Link.tsx)
- [Primer React `Link.module.css` raw source](https://raw.githubusercontent.com/primer/react/main/packages/react/src/Link/Link.module.css)
- [Primer ViewComponents link lookbook](https://primer.style/view-components/lookbook/inspect/primer/beta/link/default/)

## Main Finding

GitHub does not appear to publish a dedicated public style page for the exact
review-file link shown in pull-request discussions.

The closest public source of truth is Primer's `Link` component and related
design tokens.

## Closest Match To The Review Filename Link

The pull-request filename link treatment in GitHub review UI appears to be:

- accent blue text,
- underlined by default,
- monospace typography for file-path content,
- and standard GitHub focus treatment layered on top.

This is an inference from public Primer docs plus live GitHub UI observation,
not a published one-to-one contract for that exact review surface.

## Practical Tailwind Translation

For a generic Primer-like link:

```tsx
className =
  'text-[color:var(--fgColor-accent,#0969da)] no-underline underline-offset-[0.05rem] hover:underline focus:underline'
```

For the review-filename look that most closely matches GitHub's UI:

```tsx
className =
  'font-mono text-[color:var(--fgColor-accent,#0969da)] underline underline-offset-[0.05rem] hover:underline focus:underline'
```

## Useful Token Notes

- Light-theme accent foreground: `#0969da`
- Primer monospace stack:
  `ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace`

## Recommendation

If Noter wants the status-bar links to feel like GitHub's review-file links
instead of GitHub's default inline body links, start with the monospace,
always-underlined variant above and keep focus styling aligned with the app's
existing focus ring treatment.
