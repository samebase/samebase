# Radix UI vs Base UI Context

## Short Answer

If by "Base UI" you mean [base-ui.com](https://base-ui.com/) and not the older
`@mui/base` package, the simplest way to think about it is this:

Radix UI is the older, hugely influential headless primitives library that
helped define the modern `asChild` plus compound-parts style of React UI
composition. Base UI is the newer project that grew out of MUI's old headless
effort, then converged with Radix and Floating UI people and deliberately moved
closer to Radix's ergonomics. It is not officially "Radix 2", but that is very
close to how the ecosystem reads it.

Also, Tailwind Labs does not officially "push" Radix and Base UI as its own
primitives. Tailwind's official headless library is
[Headless UI](https://headlessui.com/), which Tailwind UI used for its React and
Vue examples in
[April 2021](https://tailwindcss.com/blog/tailwind-ui-now-with-react-and-vue-support).
The reason you keep seeing Radix and Base UI is mostly the broader Tailwind and
shadcn ecosystem, especially since shadcn added a Radix-or-Base choice in
[December 2025](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create).

## Timeline

- Around 2018: WorkOS says Colm Tuite and Stephen Haney started Modulz about
  four years before the
  [June 1, 2022 acquisition announcement](https://workos.com/blog/series-b).
  Modulz later created Radix and Stitches.
- June 19, 2020: the `radix-ui/primitives` repo was created, per
  [GitHub metadata](https://api.github.com/repos/radix-ui/primitives).
- April 14, 2021: Tailwind shipped
  [Headless UI v1.0](https://tailwindcss.com/blog/headless-ui-v1) and wired
  Tailwind UI's React and Vue examples to Headless UI in a
  [separate announcement the same day](https://tailwindcss.com/blog/tailwind-ui-now-with-react-and-vue-support).
- June 1, 2022: [WorkOS acquired Modulz](https://workos.com/blog/series-b). From
  then on, Radix became a WorkOS project.
- September 7, 2022: MUI launched
  [`@mui/base`](https://mui.com/blog/introducing-base-ui/) as "the headless
  alternative to Material UI."
- February 13, 2024: MUI published
  [An exciting year ahead for Base UI](https://mui.com/blog/base-ui-2024-plans/).
  This is a key turning point: they said the existing `slots` and `slotProps`
  API was awkward with Tailwind, considered moving to a Radix-like subcomponent
  API, and said Base UI should become its own standalone product. Colm Tuite is
  one of the coauthors.
- February 23, 2024: the standalone `mui/base-ui` repo was created, per
  [GitHub metadata](https://api.github.com/repos/mui/base-ui).
- December 17, 2024: the new standalone Base UI starts showing public alpha
  releases on its [releases page](https://base-ui.com/react/overview/releases).
- December 11, 2025: Base UI hits
  [v1.0.0 stable](https://base-ui.com/react/overview/releases).
- December 2025: shadcn launched
  [`npx shadcn create`](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create)
  and made "Radix or Base UI" a first-class choice.
- January 2026: shadcn shipped
  [full Base UI docs](https://ui.shadcn.com/docs/changelog/2026-01-base-ui).
- As of April 22, 2026: Radix is still active, not dead. Its
  [official releases page](https://www.radix-ui.com/primitives/docs/overview/releases)
  shows 2025 releases, and GitHub metadata shows pushes through
  [February 13, 2026](https://api.github.com/repos/radix-ui/primitives). But
  Base UI is clearly the faster-moving newcomer.

## Where The Drama Actually Is

- The first drama is naming. "Base UI" originally meant MUI's `@mui/base` effort
  from 2022. Today MUI's own docs say
  [`@mui/base` is deprecated and replaced by Base UI](https://v6.mui.com/base-ui/getting-started/support/).
  So people talk past each other constantly.
- The second drama is succession. Base UI's team page explicitly lists Colm
  Tuite from Radix, James Nelson from Floating UI, and several MUI engineers
  ([GitHub](https://github.com/mui/base-ui), [site](https://base-ui.com/)). My
  inference from the sources: Base UI is the convergence of three lineages, MUI
  Base's ambition, Floating UI's positioning and interactions, and Radix's API
  philosophy.
- The third drama is maintenance signaling. Base UI's homepage directly answers
  "How does Base UI differ from Radix UI?" by saying the APIs are intentionally
  similar, Base UI has more complex components, and "the most important
  difference" is active maintenance by a dedicated full-time team
  ([Base UI FAQ](https://base-ui.com/)). That is basically a public shot across
  Radix's bow.
- The fourth drama is ecosystem optics. Once shadcn made Radix and Base UI
  interchangeable choices in
  [December 2025](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create),
  the competition stopped feeling theoretical.
- The fifth drama is migration pain. shadcn's own
  [discussion about migrating from Radix to Base UI](https://github.com/shadcn-ui/ui/discussions/6248)
  shows it is not a drop-in swap; `Select` alone differs enough to be annoying.
- But there is not much evidence of a giant personal feud in public sources. The
  drama is mostly product-direction drama, maintenance-anxiety drama, and "is
  this the real successor?" drama.

## What Is Actually Different In The Libraries

- Radix's core identity is design-system primitives: unstyled, accessible,
  compound parts, heavy use of `data-state`, and the famous
  [`asChild` composition model](https://www.radix-ui.com/primitives/docs/guides/composition).
  It also has sibling products like Themes, Colors, and Icons.
- Base UI's current identity is: a broader standalone headless library,
  [built on top of Floating UI](https://floating-ui.com/), with a team drawn
  from Radix plus Floating UI plus MUI, and a wider component surface including
  things like Combobox and Autocomplete ([Base UI FAQ](https://base-ui.com/)).
- Radix styling is very Tailwind-friendly because it exposes `className` and
  [`data-state`](https://www.radix-ui.com/primitives/docs/guides/styling). Base
  UI is also Tailwind-friendly, but goes further with
  [`className` and `style` as state-aware functions](https://base-ui.com/react/handbook/styling).
- Radix's signature composition trick is
  [`asChild`](https://www.radix-ui.com/primitives/docs/guides/composition). Base
  UI's is
  [`render` via `useRender`](https://base-ui.com/react/utils/use-render), and
  its own docs explicitly frame this as "migrating from Radix UI."
- Old `@mui/base` was much more MUI-shaped: slots, `slotProps`, and hooks. MUI
  admitted in [February 2024](https://mui.com/blog/base-ui-2024-plans/) that
  this was too verbose for Tailwind users and that they wanted a discrete
  subcomponent API instead. That is why new Base UI feels so much more
  Radix-like.
- Radix today feels more conservative and lower-level. Base UI feels more
  ambitious and more willing to expand scope quickly.

## Bottom Line

The historical truth is: Radix mattered first, and a lot. It helped define what
modern headless React primitives look like. Base UI is the newer project that
learned from both MUI's old headless work and Radix's ergonomics, then added
Floating UI DNA and stronger present-day momentum.

So the ecosystem story in 2026 is not "Radix vs some random competitor." It is
"the older library that shaped the space" versus "the newer library that looks
very much like the next phase of that same idea."

## Sources

- [WorkOS: acquires Modulz, the company behind Radix](https://workos.com/blog/series-b)
- [Radix Primitives introduction](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Radix composition](https://www.radix-ui.com/primitives/docs/guides/composition)
- [Radix styling](https://www.radix-ui.com/primitives/docs/guides/styling)
- [Radix releases](https://www.radix-ui.com/primitives/docs/overview/releases)
- [MUI: introducing `@mui/base` in 2022](https://mui.com/blog/introducing-base-ui/)
- [MUI: Base UI 2024 plans](https://mui.com/blog/base-ui-2024-plans/)
- [MUI Base docs: deprecated in favor of Base UI](https://v6.mui.com/base-ui/getting-started/support/)
- [Base UI homepage and FAQ](https://base-ui.com/)
- [Base UI releases](https://base-ui.com/react/overview/releases)
- [Base UI `useRender` and migration from Radix](https://base-ui.com/react/utils/use-render)
- [Floating UI: Base UI is built on top of it](https://floating-ui.com/)
- [Tailwind: Headless UI v1](https://tailwindcss.com/blog/headless-ui-v1)
- [Tailwind: Tailwind UI React and Vue support via Headless UI](https://tailwindcss.com/blog/tailwind-ui-now-with-react-and-vue-support)
- [Tailwind: Headless UI v2](https://tailwindcss.com/blog/headless-ui-v2)
- [shadcn: choose Radix or Base UI](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create)
- [shadcn: Base UI docs](https://ui.shadcn.com/docs/changelog/2026-01-base-ui)
- [shadcn discussion: Radix to Base UI migration friction](https://github.com/shadcn-ui/ui/discussions/6248)
