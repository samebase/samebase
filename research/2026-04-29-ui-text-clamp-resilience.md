# UI Text Clamp Resilience

Date: 2026-04-29

## Problem Statement

Dashboard sidebar account text currently keeps wrapping as the sidebar is resized into very narrow
widths. In `apps/noter/src/components/vault-dashboard/VaultDashboardChrome.tsx:80`, the account
email uses `break-words`, and the provider line at
`apps/noter/src/components/vault-dashboard/VaultDashboardChrome.tsx:82` does the same for
`Signed in with {providerLabel}`. Provider status rows have the same unbounded wrapping pattern at
`apps/noter/src/components/vault-dashboard/VaultDashboardChrome.tsx:160`.

That behavior is technically responsive, but at the supported resize floor it can turn compact
sidebar rows into tall text columns. The intended constraint is not "make text fit at any width"; it
is "keep chrome predictable at the sidebar's configured minimum width."

For the dashboard route, the active Workspace Layout V2 desktop resize floor is
`WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160` at
`apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx:25`, and the resize handle
clamps both desktop sidebars to that floor at
`apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx:859` and
`apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx:878`. That 160px rail is the
minimum supported width for dashboard sidebar content.

## Existing Repo Pattern

Noter already uses multi-line clamps in several shipped surfaces:

- `apps/noter/src/index.css:257` defines `.line-clamp-2`, and `apps/noter/src/index.css:264` defines
  `.line-clamp-3`.
- `apps/noter/src/components/MachinesWorkspaceView.tsx:191` explicitly handles a narrow-rail case
  where fixed timestamp chrome can starve text width.
- `apps/noter/src/components/MachinesWorkspaceView.tsx:255` combines `min-w-0`, `line-clamp-2`, and
  `[overflow-wrap:anywhere]` for thread titles.
- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx:162` uses `[overflow-wrap:anywhere]` in
  the title recipe, then clamps the collapsed state at
  `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx:194`.

That newer machine-sidebar pattern is the best local precedent: shrink the flex child, allow hostile
strings to break, and cap the visible line count.

## Standards And Browser Notes

[MDN documents `line-clamp`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-clamp)
as a way to limit block content to a fixed number of lines, while also noting that unprefixed
`line-clamp` is not Baseline across all widely used browsers. The practical interoperable form is
still the legacy-compatible WebKit trio: `display: -webkit-box`, `-webkit-box-orient: vertical`, and
`-webkit-line-clamp`. MDN notes that this co-dependent behavior is specified and will continue to be
supported.

[Tailwind's `line-clamp` utility](https://tailwindcss.com/docs/line-clamp) emits that same CSS
shape: `overflow: hidden`, `display: -webkit-box`, `-webkit-box-orient: vertical`, and
`-webkit-line-clamp: <number>`. Noter is on Tailwind 4.2.2, so no extra plugin is needed for normal
Tailwind clamp classes. The local `.line-clamp-2` and `.line-clamp-3` definitions duplicate the same
idea for current callsites.

[MDN documents `text-overflow`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-overflow)
as inline overflow handling. It needs overflow plus a no-wrap condition to produce a one-line
ellipsis, so it is the right tool for labels that must stay single-line, not for two- or three-line
sidebar metadata.

[MDN's flex docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/flex) call
out that flex items do not shrink below their min-content size by default. That is why the clamp
recipe needs `min-w-0` on the text-bearing flex child.

[MDN's `overflow-wrap` docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-wrap)
describe `anywhere` as allowing otherwise unbreakable strings to break at arbitrary points and
letting those break opportunities count for min-content intrinsic sizing. That matters for emails,
repository names, branch names, URLs, and provider status strings inside narrow flex rails.

## Impact

The product impact is positive for chrome stability. Account rows, provider rows, thread rows,
branch labels, and compact metadata become bounded UI surfaces instead of expanding vertically
without limit. The tradeoff is that some content becomes partially hidden, so critical identifiers
should keep an accessible full value through a `title`, an `aria-label` on interactive rows, or a
nearby details surface when needed.

Below the configured sidebar floor, no CSS truncation strategy should be treated as a supported
product contract. `overflow-wrap:anywhere` will let text reduce instead of forcing overflow, and
`line-clamp-2` or `line-clamp-3` will cap vertical growth, but the ellipsis itself can be clipped if
there is not enough inline space. The target below the floor is graceful failure; the target at the
floor is stable, usable chrome.

The performance overhead is negligible when this stays CSS-only. A clamp is a few declarations on
already-rendered text. It does not add subscriptions, layout effects, resize observers, or
measurement loops. JavaScript is only needed for optional "expand full text" behavior or for
detecting whether text actually overflowed; those should remain case-by-case, not part of the
default sidebar chrome recipe.

The CSS bundle overhead is also small. Tailwind already provides clamp utilities, and Noter already
has local definitions for two- and three-line clamps. Adding classes at callsites has no meaningful
runtime cost. A new React wrapper component would create more overhead than the CSS itself unless
several surfaces prove they need the exact same interactive behavior.

## Suggested Standard

Use a small callsite recipe instead of a new abstraction for now:

- Single-line chrome labels: `min-w-0 truncate`.
- Two-line compact metadata: `min-w-0 line-clamp-2 [overflow-wrap:anywhere]`.
- Three-line summaries: `min-w-0 line-clamp-3 [overflow-wrap:anywhere]`.

Prefer two lines for sidebar account/provider metadata and list rows. Use three lines for card
summaries or preview text where the row height is already meant to breathe.

Do not apply this by default to editors, code blocks, terminal output, logs, document bodies, form
fields, or comparison tables where seeing the full value is the point of the surface.

## Dashboard-Specific Recommendation

The first concrete patch can be small:

1. Change the dashboard account email and provider status lines from `break-words` to the two-line
   clamp recipe.
2. Apply the same recipe to provider row status text.
3. Keep the existing `displayName` trigger as `truncate`; it is already a single-line control label.
4. Add route-level or honest visual fixture coverage for an intentionally narrow dashboard sidebar,
   including a long email and a long provider status.

That would address the reported squishing without introducing JavaScript. If the same pattern
spreads across several more app-owned surfaces, consider promoting the exact recipe to a small CSS
utility, not a React component.

## Validation Plan

- Run the dashboard route or the closest production-component visual fixture at a normal width and
  at the configured 160px desktop sidebar floor.
- Confirm rows remain bounded to two visible lines for account/provider metadata.
- Confirm action buttons stay reachable and pending states still fit.
- Add screenshot coverage with long email/provider strings if the follow-up patch changes shipped
  UI.
