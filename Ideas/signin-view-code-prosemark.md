# Idea: Sign-in As A Living Doc (`view | code`)

## Goal

Make the sign-in screen behave like a rendered document, not a hardcoded React layout:

- `view`: users see the rendered landing + interactive sign-in controls
- `code`: users see the source for the same screen (like mermaid renderers)

This keeps landing UX editable as content while preserving product-grade auth actions.

## Why this is interesting

- Landing copy and structure can evolve quickly without touching component JSX every time.
- The UI and its source stay in sync by design.
- It fits Noter's "docs + code in one place" product identity.

## Product shape

Top-right segmented toggle on sign-in screen:

- `view` (default): rendered markdown + live auth controls
- `code`: read-only source panel for the same document

### What "source" means

Recommended baseline:

- Show the markdown source file used to render the page.

Optional later enhancement:

- Secondary sub-toggle in code mode: `md | generated-tsx`
- `generated-tsx` is a debug artifact, not hand-edited code.

## Recommended source model

Use a markdown file with safe shortcodes for interactive blocks.

Example sketch:

```md
# If Notion and Obsidian had a baby

- stores everything on GitHub
- supports real-time collaboration
- is mobile-web first

[[auth.google]] [[auth.password-dev]] [[auth.waitlist]]
```

Renderer maps each shortcode to a known React component. No dynamic code eval.

## Why shortcode markdown (recommended) vs MDX

- MDX is powerful but adds runtime/build complexity and execution surface.
- Shortcode markdown is deterministic and safe.
- We only need a finite set of interactive blocks for landing screens.

## Implementation sketch (later)

1. **Content file**
   - Add `apps/noter/src/content/signin.landing.md` (or reuse `noter.md` section if preferred).
2. **Doc renderer**
   - Parse markdown with existing pipeline.
   - Detect shortcodes like `[[auth.google]]`.
   - Render mapped components inline.
3. **Toggle UI**
   - Add compact top-right toggle in sign-in card: `view | code`.
4. **Code mode**
   - Reuse `ProsemarkReadOnly` (or read-only CodeMirror) to show raw markdown source.
5. **Guardrails**
   - Unknown shortcode renders a visible warning placeholder in dev, no-op in prod.
   - Strict whitelist mapping for interactive blocks.

## Component mapping (first pass)

- `[[auth.google]]` -> current `SignInWithGoogle`
- `[[auth.password-dev]]` -> current `PasswordAuthForm` gated by `import.meta.env.DEV`
- `[[auth.waitlist]]` -> current `WaitlistForm`

## UX details

- Persist last mode (`view` or `code`) in localStorage key scoped to sign-in screen.
- Default to `view` for first-time visitors.
- In `code` mode, disable editing (read-only).

## Risks and mitigations

- **Risk:** drift between shortcode contract and component props.
  - **Mitigation:** typed shortcode schema + unit tests.
- **Risk:** over-flexibility in content format.
  - **Mitigation:** keep shortcode vocabulary intentionally small.
- **Risk:** visual instability from malformed markdown.
  - **Mitigation:** fallback to plain sign-in component layout if parse fails.

## Rollout plan

1. Build behind feature flag (`signin_doc_renderer`).
2. Internal dogfood only.
3. Ship as default if no regressions in auth conversion and error rate.

## Nice follow-ups

- Reuse same renderer model for onboarding cards and waitlist states.
- Extend shortcode system for small interactive docs in vaults.
