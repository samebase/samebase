# Pitch Deck Story Draft

Date: 2026-03-23

## Goal

Keep the deck very small.

The story should explain four things fast:

- app builders often put model access behind credits or token pricing
- no-code tools split people into config users and real-code implementers
- ideas die when the environment takes minutes to open
- Noter keeps both paths in real code
- Noter is built on the same stack it asks users to trust

## Core Thesis

Best current opening:

`Use Codex or Claude. Keep your stack.`

Best current support line:

`Noter is the thin layer around GitHub, Cloudflare, and Convex.`

What this means:

- `keep your stack` does not mean stackless or vague
- Noter can wrap existing GitHub work, edit files, and preview changes across
  many projects
- the opinionated path is GitHub, Cloudflare, and Convex
- that stack is portable: users can keep it even if they ever leave Noter
- many serious builders already pay for fixed AI tools like Codex or Claude
- many app builders still meter model usage again through credits or tokens
- no-code systems usually start with config and end with custom code anyway
- many browser builders still make you wait minutes before you can really work
- AI changes that tradeoff because writing code is now easier than stretching
  JSON config

## Audience

- semi-technical builders who already use AI heavily
- developers who want ownership and predictable cost
- teams that want real code, real repos, and a stack they can keep

## Repo-Wide Takeaways

These themes show up repeatedly across the repo and should influence the deck:

- `same stack seniors actually use`
- `web-first so any agent can use it`
- `monitor and edit your apps when you're on the go`
- `docs + code in one place`
- `terminal is the escape hatch, not the product`
- `Git is the durable layer`

What they suggest for the deck:

- Noter should feel opinionated, not generic
- mobile and browser access are product pillars, not side benefits
- GitHub should read as the durable system of record
- the AI/product UX should feel transparent, not magical in a fragile way

## Main Deck

Use 7 slides.

### 1. Opening

Headline:

`Use Codex or Claude. Keep your stack.`

Support:

`Noter sits around your real tools instead of reselling them back to you.`

### 2. Problem One

Headline:

`App builders add an AI tax.`

Support:

`You already pay for the model. Then the builder meters it again.`

Proof chips:

- `credits`
- `tokens`
- `usage pricing`

### 3. Problem Two

Headline:

`No-code creates two classes of developers.`

Support:

`First you stretch config. Then you rewrite the hard parts in code.`

Proof chips:

- `JSON config`
- `support walls`
- `real code later`

### 4. Product

Headline:

`In Noter, both paths are just code.`

Support:

`With AI and strong rules, code is simpler than growing config.`

Proof chips:

- `real files`
- `real repos`
- `real deploys`

### 5. Speed

Headline:

`Ideas should start in seconds, not minutes.`

Support:

`Open the project, inspect it, and change it before the idea fades.`

Proof chips:

- `web-first`
- `mobile usable`
- `instant dev env`

Why this matters:

- a lot of browser builders still take minutes to become useful
- the target experience is several seconds, not several minutes
- the dev environment should feel invisible, not like a separate system to
  manage

Implementation note:

- lead with the outcome, not the vendor
- if needed in narration: Noter uses Daytona today because speed is the main
  requirement

### 6. Stack

Headline:

`Three services. One sane stack.`

Support:

`GitHub stores the source, Cloudflare publishes it, Convex powers the app.`

Proof chips:

- `GitHub: source of truth`
- `Cloudflare: publish + domains`
- `Convex: data + backend`

Why this matters:

- GitHub is where files live
- Cloudflare is the front door
- Convex is simpler than stitching together database, ORM, migrations, and API
  layers
- the stack is opinionated, but it is not a trap
- users should be able to keep using it even without Noter

### 7. Proof

Headline:

`We build Noter with Noter.`

Support:

`If the workflow is weak, we feel it first.`

Proof chips:

- `real repo workflows`
- `real Cloudflare + Convex`
- `real product pressure`

## Visual System

The deck should reuse the logo system.

Best framing:

- use the 3D logo as the opening mark
- map one visible face to each stack layer
- keep that mapping consistent across the deck

Recommended face mapping:

- `GitHub`
- `Cloudflare`
- `Convex`

Useful repo references:

- `/logo`
- `/logo-iso`
- `/logo-svg`

The logo is already a good visual language for the stack because it is one shape
with multiple stable representations. The deck should use that instead of
inventing new diagrams.

## Copy Rules

- one idea per slide
- one headline per slide
- one short support line only when needed
- at most 3 proof chips
- no paragraphs on slides
- no dense architecture diagrams

## Candidate Lines

Strong:

- `Use Codex or Claude. Keep your stack.`
- `App builders add an AI tax.`
- `In Noter, both paths are just code.`
- `Ideas should start in seconds, not minutes.`
- `Three services. One sane stack.`
- `We build Noter with Noter.`

Good backups from the repo:

- `a dev environment for your Codex agent`
- `focus on your business instead of your tech stack`
- `a simpler way to use GitHub`
- `the same stack seniors actually use`
- `web-first so any agent can use it`
- `monitor and edit your apps when you're on the go`

Good backup concepts from repo research:

- `Everything is text. Everything is instant.`
- `Docs and code in one place.`
- `Terminal as escape hatch, not primary UX.`
- `Git as the durable layer.`

Use carefully:

- `if Lovable could build Lovable`
- `Noter can disappear tomorrow and your app will be completely unimpacted`

## Notes

- Avoid saying we `guarantee` the stack.
- Better: the stack is under daily load because we use it ourselves.
- `Keep your stack` should mean portable, not generic.
- Better: Noter can wrap existing GitHub work, but the recommended path is the
  opinionated GitHub + Cloudflare + Convex stack.
- Avoid broad lock-in claims that are easy to dispute.
- Better: many builders still want to own the billing surface and the happy
  path.
- Do not lead with Daytona as a brand name.
- Lead with the result: instant access, mobile access, and an invisible dev
  environment.

## Sources

Repo context:

- [VISION.md](/Users/nicu/.codex/worktrees/6d39/noter/VISION.md)
- [TODO.md](/Users/nicu/.codex/worktrees/6d39/noter/TODO.md)
- [slogans.md](/Users/nicu/.codex/worktrees/6d39/noter/slogans.md)
- [Ideas/senior-stack-for-juniors.md](/Users/nicu/.codex/worktrees/6d39/noter/Ideas/senior-stack-for-juniors.md)
- [Ideas/signin-view-code-prosemark.md](/Users/nicu/.codex/worktrees/6d39/noter/Ideas/signin-view-code-prosemark.md)
- [Ideas/daytona-terminal-ui-transparency.md](/Users/nicu/.codex/worktrees/6d39/noter/Ideas/daytona-terminal-ui-transparency.md)
- [Ideas/worktree-conversation-log.md](/Users/nicu/.codex/worktrees/6d39/noter/Ideas/worktree-conversation-log.md)
- [docs/research/onboarding-video-tooling-2026-03-19.md](/Users/nicu/.codex/worktrees/6d39/noter/docs/research/onboarding-video-tooling-2026-03-19.md)
- [specs/024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md](/Users/nicu/.codex/worktrees/6d39/noter/specs/024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md)
- [specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md](/Users/nicu/.codex/worktrees/6d39/noter/specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md)
- [specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md](/Users/nicu/.codex/worktrees/6d39/noter/specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md)
- [specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md](/Users/nicu/.codex/worktrees/6d39/noter/specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md)

External context:

- [Lovable Pricing](https://lovable.dev/pricing)
- [v0 Pricing](https://v0.dev/pricing)
- [Builder.io: Introducing Usage-Based Agent Credits](https://www.builder.io/blog/introducing-agent-credits)
