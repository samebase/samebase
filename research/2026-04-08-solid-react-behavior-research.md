# Solid React behavior research

## Scope

This note captures a small local spike plus current external reports about using
Solid in production, with emphasis on how Solid components feel compared to
React components and what that likely means for Noter.

## Local spike

I created two small Vite labs inside the repo:

- React: `apps/react-behavior-lab`
- Solid: `apps/solid-behavior-lab`

Each app renders the same machines-like surface:

- search field
- list of 12 visible machine rows from a larger array
- selected-machine detail pane
- unrelated `heartbeat` state update button
- selection and pinning interactions

The React demo also includes a `React.memo` toggle because that is one of the
main practical differences in day-to-day code shape.

## What the component code felt like

### React

- Familiar hook shape with `useState`, `useMemo`, and `useCallback`
- Straightforward baseline implementation
- Once row churn matters, performance policy starts leaking into the component
  shape:
  - `React.memo`
  - stable callback props
  - paying attention to object identity

### Solid

- JSX still looks familiar
- State is expressed with `createSignal` and derived state with `createMemo`
- List rendering uses `<For>`
- The basic version stays close to the "naive but correct" implementation
- Components run once; tracked reads inside JSX and effects respond to updates

Relevant official docs:

- Solid JSX tracking and one-time component execution:
  [link https://docs.solidjs.com/concepts/intro-to-reactivity](https://docs.solidjs.com/concepts/intro-to-reactivity)
- Solid `createSignal`:
  [link https://docs.solidjs.com/reference/basic-reactivity/create-signal](https://docs.solidjs.com/reference/basic-reactivity/create-signal)
- Solid `<For>`:
  [link https://docs.solidjs.com/reference/components/for](https://docs.solidjs.com/reference/components/for)
- React `memo`:
  [link https://react.dev/reference/react/memo](https://react.dev/reference/react/memo)

## Measured spike results

### Build output

Using production builds for the tiny demos:

- React app JS: `195.60 kB` before gzip
- Solid app JS: `18.76 kB` before gzip

This is only one tiny app, so it is not a promise about Noter, but it does
reinforce that Solid starts from a much smaller runtime baseline.

### Interaction checks

I drove both apps with Playwright.

React app:

- Initial first-row render counter: `2`
- After one unrelated heartbeat tick: `4`
- After enabling `React.memo` rows and ticking heartbeat again: stayed at `2`

Notes:

- The initial `2` is expected because the React demo runs in `StrictMode` during
  development.
- The memo toggle remounts rows in this demo, so the useful comparison is what
  happens after the toggle is on.

Solid app:

- Initial first-row selected-check counter: `1`
- After one unrelated heartbeat tick: still `1`
- After changing selection: visible rows observed `2`

Interpretation:

- Unrelated parent state did not touch the row-local tracked counters in the
  Solid version.
- Selection still caused reevaluation across the list because every row depends
  on `selectedMachineId`.
- This is a useful nuance: Solid is not "zero work everywhere", but it removes a
  lot of the broad parent rerender pressure that React teams often manage
  explicitly with memoization.

## Production reports and community signal

These are anecdotal, not guarantees, but they are useful pattern-matching.

### Positive signal

- A recent Reddit thread on production use includes reports of:
  - multiple production apps
  - a Solid plus TanStack Start app that the author says replaced a React app
    because the React version could not stay performant enough for a highly
    dynamic drag-and-drop editor
  - teams shipping larger SolidStart apps with tens of thousands of active users
  - a production Chrome extension using Solid Source:
    [link https://www.reddit.com/r/javascript/comments/1pqhgfi/askjs_is_anyone_using_solidjs_in_production_whats/](https://www.reddit.com/r/javascript/comments/1pqhgfi/askjs_is_anyone_using_solidjs_in_production_whats/)

- Another larger-app thread includes a report from Chessbook describing a `30k`
  LOC Solid app serving tens of thousands of users, with the author explicitly
  saying they were more productive than with React. Source:
  [link https://www.reddit.com/r/solidjs/comments/1fb50sq/solid_in_larger_apps/](https://www.reddit.com/r/solidjs/comments/1fb50sq/solid_in_larger_apps/)

### Caveats people keep repeating

- Ecosystem size is still the most common warning:
  - smaller hiring pool
  - fewer maintained UI libraries
  - less standardization around "the default stack" Sources:
    [link https://www.reddit.com/r/solidjs/comments/1len1pf](https://www.reddit.com/r/solidjs/comments/1len1pf)
    [link https://www.reddit.com/r/solidjs/comments/1fb50sq/solid_in_larger_apps/](https://www.reddit.com/r/solidjs/comments/1fb50sq/solid_in_larger_apps/)
    [link https://www.reddit.com/r/solidjs/comments/x4k19p](https://www.reddit.com/r/solidjs/comments/x4k19p)

- Some developers still report that Solid's reactive model has its own learning
  curve, especially around list behavior, stores, nested objects, and
  expectations imported from React. Source:
  [link https://github.com/solidjs/solid/discussions/1042](https://github.com/solidjs/solid/discussions/1042)

- Recent advocacy posts are enthusiastic, but even they still warn against
  rewriting production apps just because the framework is attractive. Source:
  [link https://dev.to/tomaslistiak/why-solidjs-is-winning-the-framework-game-4i5o](https://dev.to/tomaslistiak/why-solidjs-is-winning-the-framework-game-4i5o)

## TanStack angle

TanStack materially improves the Solid story:

- Solid Query is officially supported:
  [link https://tanstack.com/query/latest/docs/framework/solid/overview](https://tanstack.com/query/latest/docs/framework/solid/overview)
- TanStack Router explicitly supports React and Solid:
  [link https://tanstack.com/router/latest/docs/overview](https://tanstack.com/router/latest/docs/overview)
- TanStack Virtual supports Solid for long lists:
  [link https://tanstack.com/virtual/latest/docs/introduction](https://tanstack.com/virtual/latest/docs/introduction)

This matters for Noter because it reduces the amount of framework-specific
infrastructure we would have to invent ourselves if we did a Solid pilot.

## Likely implication for Noter

For Noter specifically, the most believable upside is not "everything becomes
trivially fast". It is:

- smaller client baseline
- easier-to-reason-about dynamic local state in complex surfaces
- fewer explicit memoization escape hatches in list-heavy and interaction-heavy
  UI

The biggest risk remains ecosystem compatibility:

- Convex and auth integrations are still more React-shaped in our codebase
- Radix-heavy shared UI would not port directly
- the team would need to learn Solid's reactive edge cases instead of React's
  rerender edge cases

## Current recommendation

If we continue exploring, the best next spike is still a bounded surface rather
than a wholesale rewrite:

- machines route or a machines-adjacent surface
- TanStack Router and Query from day one on the Solid side
- TanStack Virtual only once we truly need it

That keeps the experiment honest and limits the migration tax.
