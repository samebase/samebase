# Landing Positioning Idea Capture

## Status

- Status: Research / idea capture, not an accepted product spec.
- Last updated: 2026-07-23.
- Source: operator landing-preview discussion, especially the June 2026 iteration around
  `/landing-preview` becoming the future `/` page.
- Related PR: https://github.com/samebase/samebase/pull/1112
- Related files:
  - `apps/samebase/src/components/LandingPreviewPage.tsx`
  - `apps/samebase/src/content/landing-do-it-yourself.md`
  - `specs/035_LANDING_SLOGAN_SOURCE_AND_SELECTION_SPEC.md`
  - `specs/088_LANDING_README_PREVIEW_SPEC.md`

## Why This Exists

The landing page is still being figured out. The thread contains useful product-language, trust, and
positioning ideas that should not stay only in chat history. This file is a parking lot for those
ideas until they become either shipped page copy, an RFC, or an accepted landing-page spec.

Do not treat this note as final copy. Treat it as source material.

## Current Direction

Samebase should present itself as the correct way to build web apps.

The word "correct" needs a small footnote-style marker, like a book footnote, not a decorative star.
The footnote should explain what "correct" means for Samebase:

- honest about the stack
- cheap to leave running
- simple enough to understand
- transparent enough to replace

The landing page should feel like a help center or clear technical explanation, not a generic SaaS
marketing page. The sidebar and main-pane structure can help because it implies there are a few
durable articles, not a long sales scroll.

## Core Product Claims

### Samebase Uses The Same Base

Samebase should use the exact same technologies that it recommends to users. This is the reason for
the name Samebase.

The core argument:

> If your app builder is so good, why is it not building itself?

This should stay central. It is a trust claim, not just a stack list.

### The Stack Is A Trio

The core service stack is:

- GitHub for code and pull requests
- Convex for database, backend, and realtime functions
- Cloudflare for deploys, domains, and the front door

OpenAI/Codex should not be framed as required infrastructure. It belongs above the stack as one
possible dev tool layer. The user should be able to use Codex, Claude Code, another agent, or the
editor they already know.

### Cheap Means Cost Follows Usage

"Cheap" needs careful wording because non-developers can hear cheap as low quality.

The intended meaning:

- A one-off personal app should not cost a monthly fee just to exist.
- An idle idea should not cost USD 20/month.
- An idle idea should not even cost USD 3/month.
- An app used once per week, by 10 users per week, by 100 users per week, and by 10,000 users per
  week should not have the same cost model.
- Cost should scale with real usage, not with the fact that someone had an idea.

The landing page should explain the difference between:

- a silly app you use yourself once per week
- an app that might be forgotten for a year
- a small app with 10 or 100 users
- a real app with thousands of weekly users

Samebase should make it cheap to test an idea without penalizing the user for starting.

### Simplicity Does Not Mean Toy

"Simplicity" also needs careful wording because non-developers can hear it as not scalable.

The intended meaning:

- The system should be simple enough to inspect and understand.
- Convex is likely a major part of the explanation because it removes a lot of backend complexity.
- The page may need to compare this approach against heavier alternatives later, but it should not
  accidentally become only a Convex landing page.
- Transparency matters: if Samebase recommends Convex, GitHub, and Cloudflare, it should say so
  plainly.

Open question: link to a Convex versus Supabase comparison video, or keep third-party comparisons
out of the first landing pass?

### Parallel Work Is A First-Class Selling Point

Samebase should explain that the stack is good for parallel agent development:

- Git worktrees are supported well.
- Multiple agents can work in parallel without sharing the same local database.
- Each worktree can get its own local database deployment.
- The main local folder can keep its own persistent local deploy.
- Each pull request can get a preview deploy.
- Review happens on the exact branch being discussed.

These are related facts and should probably be explained as "work lanes":

- local folder
- worktree
- pull request

The point is not just "we have previews." The point is that each lane can have an isolated surface
for code, data, and review.

### Native Windows Support Is A Stack Claim

The starter's core local workflow runs natively on macOS, Linux, and Windows. Windows is the
surprising part and should be named directly on the landing page, not left inside setup docs.

The reason is concrete: Node 24 runs the repository's automation directly from TypeScript, while the
scripts pass environment, working-directory, and process arguments through Node APIs instead of
requiring Bash or WSL. Keep the public claim scoped to the starter's core workflow until the starter
itself has full multi-OS CI.

## Audience Trust Model

The operator described the trust order like this:

1. first user: me
2. second user base: my friends
3. later users: people I do not know

This forces Samebase to be transparent. The product is not being made only because paying customers
need it. It is made because the operator wants this setup for their own apps and does not want the
bad version of this setup for themselves.

Potential framing:

- I built this for myself first.
- I use the same stack I recommend.
- I do not want users trapped in an app builder.
- The output should be normal code and normal infrastructure.

Avoid turning this into a sentimental founder story. The useful product point is practical trust:
Samebase has to be good enough for the builder to rely on it personally.

## Page Structure Ideas

The likely landing route is `/`, with the user not logged in.

The first impression should be directed. Starting with both sidebars closed can help the page focus
on the main explanation first.

The left sidebar should be sparse for now:

- no folders
- no hashtag links
- only two file-like links for the first pass
- likely `Overview` and `Do it yourself`

Manual setup instructions should not be the landing page. They belong at `/landing/do-it-yourself`,
as a help-center article for people who want to build it themselves.

The landing page itself should be normal React, not constrained to rendered Markdown. The Markdown
renderer still matters for article pages like the manual setup guide.

## Design Process Ideas

Codex should not be asked to invent beauty from nothing. Better landing-page work needs structured
design input.

Useful tools mentioned:

- Figma plus Figma MCP for real layout, layer, component, variable, and token context
- Google Stitch for early high-fidelity visual directions
- Figma Make / Figma Sites for editable landing prototypes
- Relume for sitemap, sections, wireframes, and style guides
- Open Design as an experiment

Recommended workflow from the discussion:

1. Gather 6-10 references from Mobbin Sites, SaaS Landing Page, Lapa Ninja, and real developer-tool
   sites.
2. Use Stitch or Figma Make to generate 3 visual directions.
3. Pick one direction and refine it in Figma.
4. Connect Figma MCP to Codex or Claude Code.
5. Have Codex implement the actual React/Tailwind page in Samebase.
6. Run a critique pass with Claude Code or a design-review skill.
7. Verify desktop and mobile screenshots with Playwright.

## Open Copy Questions

- How do we say "cheap" without implying low quality?
- How do we say "simple" without implying not scalable?
- How much should Convex be foregrounded before it sounds like a Convex ad?
- Should the page include concrete price examples, or keep the first pass conceptual?
- Should the page include a direct "why not other app builders" section?
- How personal should the "I built this for myself first" explanation be?
- Should the help-center sidebar stay visible on first load, or start closed for focus?
- When `/landing-preview` becomes `/`, what happens to the preview route?

## Promotion Path

Use this note as source material while iterating. When the direction stabilizes:

1. Move settled behavior into code and tests.
2. Move concrete proposal material into an RFC only if the landing-page direction needs a reviewed
   plan.
3. Move accepted durable behavior into a spec only when future agents must obey it.
4. Delete or archive this research note once it stops being useful.

## Direction Chosen (2026-07-02)

Four HTML mockup directions (footnote manifesto, spec sheet, isometric base, quiet document) were
generated against the locked copy and judged from screenshots across three lenses: typographic
craft, brand fit, and first-impression clarity. The footnote manifesto won all three votes and is
now implemented in `LandingPreviewPage.tsx`, with two grafts from the spec-sheet direction:

- the cost table (idle idea → $0.00 in cyan, down to "follows usage")
- the provider ownership rows (account owner: you / console / hidden by samebase: nothing)

The footnote system is the organizing idea: `*` correct, `†` cheaper and more powerful, and `‡`
$0/month all resolve in a book-style notes block with short receipts. Remaining open items: whether
the hero CTA should stay "Sign in" (auth is Google + password today, so "Sign in with GitHub" would
be dishonest), and whether the isometric trio diagram idea returns once it can be crafted well.

## Interview Companion

The 2026-07-02 copy interview with the operator (inversion thesis, provider war stories with
numbers, the 3-boxes-2-connections security drawing, the leaving test) is distilled in
`research/2026-07-02-landing-copy-interview.md`. Use it as the primary source for copy rewrites.
