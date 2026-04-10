# ChatGPT conversation: frontend frameworks, LLMs, and Convex

Date: 2026-03-14

## What we covered

### File-based routing options besides Next.js and Vinext

We discussed frameworks and libraries with file-based routing, including:

- Nuxt
- SvelteKit
- Astro
- Remix
- Qwik City
- TanStack Start
- SolidStart
- React Router file-route conventions

### Which ones are Vite-based or have Vite-like DX

We narrowed that to:

- SvelteKit
- Astro
- Nuxt
- Qwik City
- TanStack Start
- SolidStart
- Remix with stable Vite support

A practical ranking for Vite-like DX was:

1. SvelteKit
2. Astro
3. TanStack Start
4. Nuxt
5. SolidStart
6. Qwik City
7. Remix

### Which ones support React

We focused on:

- TanStack Start
- React Router
- Astro + React

We also discussed reasons to use something else:

- SvelteKit for a simpler mental model
- Astro for content-heavy or islands-style work
- Nuxt if Vue is preferred

### Svelte vs React mental model

We discussed the difference in thinking between React + TypeScript, Svelte, and
Elm-style architecture.

Main points:

- React + TypeScript is JavaScript-first, with framework APIs and types layered
  on top
- Elm pushes stronger modeling and compiler-guided design
- Svelte tries to reduce framework ceremony and make UI feel like a more direct
  consequence of state changes

We also noted that Svelte is not really “Elm but practical”; it stays in JS/TS
but without Elm’s hard guarantees.

### shadcn support

We covered that:

- official shadcn/ui is React-focused
- Svelte uses shadcn-svelte, which is a separate community-led project

Practical conclusion:

- React has the cleanest shadcn/ui path
- Svelte can get a similar style, but not with the exact same official component
  system

### LLM support for React vs Svelte

You asked for actual studies or benchmarks.

We reviewed:

- Web-Bench as the most directly relevant benchmark including both React and
  Svelte
- DesignBench as a broader frontend benchmark with React but not Svelte
- SvelteBench as a Svelte-focused benchmark

Main conclusion:

- React is still the safer default for LLM-assisted frontend work overall
- Svelte is no longer a bad LLM target, especially with strong current models
- There was not strong enough evidence to claim that Svelte is categorically
  better for correctness-per-token

### Convex with Svelte

We clarified that you meant Svelte, not “FELD.”

Main conclusion:

- Svelte works with Convex and has official support
- Convex + Svelte is viable and documented
- Convex + React still looks more mature and polished overall, especially around
  SSR and integration depth

### Svelte template syntax objection

You pointed out that Svelte’s custom `{#if}` and related syntax feels like
learning another mini-language.

We concluded:

- this is a valid criticism
- Svelte does introduce a template DSL
- React keeps everything closer to JavaScript/JSX
- if “just JavaScript” is a hard requirement, Svelte is probably not a match

### Vue

You asked whether Vue looks better.

We covered that Vue still has its own template language through directives like:

- `v-if`
- `v-for`
- `v-model`
- `@click`
- `:class`

Conclusion:

- Vue may look cleaner to some people than Svelte
- but it still is not “just JavaScript” in the way React/JSX is

### React but simpler

You asked whether there are React-like options that are simpler.

We discussed:

- modern React itself being simpler if you avoid unnecessary effects and
  memoization
- Preact as the closest “React but simpler” option
- signals as a way to reduce `useEffect` / `useMemo` friction
- Solid as JSX with a simpler reactive mental model, though not actually React

Practical conclusion:

- Preact is the closest match for “React but simpler”
- React + signals can reduce some pain without leaving React
- Solid is relevant if JSX matters more than strict React compatibility

### Signals and Solid

We covered:

- signals as reactive values with automatic dependency tracking
- Solid as a framework built around fine-grained reactivity and signals-like
  primitives

Main idea:

- signals reduce manual dependency and memo bookkeeping
- Solid uses JSX but avoids much of React’s rerender-centric mental model

## Final direction the conversation seemed to land on

Your preferences seemed to converge toward:

- JSX / JavaScript rather than template DSLs
- fewer framework-specific mini-languages
- less `useEffect` / `useMemo` confusion
- interest in React-compatible or React-adjacent solutions

The strongest candidates based on that were:

- React with modern best practices
- React + signals
- Preact
- possibly Solid if JSX matters more than React ecosystem compatibility
