# Onboarding Video And Interactive Walkthrough Tooling Research

Date: 2026-03-19

## Why This Document Exists

We need a practical path for onboarding content that explains Noter in a simple
sequence:

1. Start with GitHub because that is where the user's files live.
2. Use `noter.md` as the simplest note-taking surface.
3. If the user wants something public, connect Cloudflare Pages.
4. If the user needs app data, connect Convex.
5. Mention Cloudflare-backed speed as a supporting benefit, not as the first
   concept.

This memo focuses on tooling for producing that onboarding experience, including
video and step-by-step walkthroughs.

## Why This Lives In `research/`

This is exploratory tooling research, not a product or architecture spec. It
does not define a new runtime contract, numbered rollout plan, or implementation
requirement, so it fits better under `research/` than under `specs/`.

## Recommendation

Use a three-part stack:

- `NotebookLM` for message development and script iteration.
- `Screen Studio` plus `Descript` for the polished explainer video.
- `Guidde` or `Supademo` for the step-by-step walkthrough users can actually
  follow.

If we want the fastest reasonable path, the default stack should be:

1. Feed source material into NotebookLM and use it to pressure-test the
   narrative.
2. Record the real product flow with Screen Studio.
3. Polish narration, captions, and cuts in Descript.
4. Publish a parallel walkthrough in Guidde or Supademo for self-serve
   onboarding.

## Tool Shortlist

### NotebookLM

- Best for: source-grounded outlines, script exploration, and rough explainer
  generation.
- Why it fits: it can ingest notes, docs, URLs, audio, and other source
  material, which makes it useful for turning product docs into an onboarding
  narrative.
- Limitation: it is better for research and drafting than for the final public
  onboarding asset. Generated output still needs human review before it becomes
  user-facing product messaging.
- Official sources:
  [NotebookLM](https://workspace.google.com/products/notebooklm/),
  [Video Overviews help](https://support.google.com/notebooklm/answer/16454555?hl=en)

### Descript

- Best for: editing narration, captions, voice cleanup, and assembling a clean
  explainer from script plus screen recording.
- Why it fits: it is the strongest all-in-one option if we want one editor for
  record, edit, caption, and export.
- Limitation: it is not itself the interactive onboarding surface.
- Official sources: [Descript](https://www.descript.com/),
  [AI Video Maker](https://help.descript.com/hc/en-us/articles/35650061759501-AI-Video-Maker)

### Screen Studio

- Best for: polished live product demos with smooth motion and visual focus.
- Why it fits: it is the cleanest way to make a short founder-style product
  walkthrough feel high quality without building a heavy video workflow.
- Limitation: it is macOS-only.
- Official sources: [Screen Studio](https://screen.studio/),
  [Install guide](https://screen.studio/guide/installing-screen-studio)

### Loom

- Best for: quick internal or external walkthroughs when speed matters more than
  polish.
- Why it fits: useful for early drafts and fast iteration before investing in a
  more polished asset.
- Limitation: better as a fast capture tool than as the final onboarding system.
- Official source: [Loom](https://www.loom.com/)

### Guidde

- Best for: captured how-to flows that become narrated onboarding assets.
- Why it fits: strong if we want one capture flow to become both a guide and a
  lightweight video-style artifact.
- Limitation: less cinematic than a dedicated polished video workflow.
- Official source: [Guidde](https://www.guidde.com/)

### Supademo

- Best for: interactive walkthroughs and product onboarding flows.
- Why it fits: probably the best fit if the goal is for users to click through
  onboarding steps instead of only watching a video.
- Limitation: better for interactive guidance than for a hero explainer video.
- Official source:
  [Supademo Product Onboarding](https://supademo.com/use-cases/product-onboarding)

### Synthesia

- Best for: avatar-led explainer videos without recording a human presenter.
- Why it fits: useful if we want script-to-video output without recording
  ourselves.
- Limitation: higher risk of the output feeling generic or detached from the
  real product.
- Official source:
  [Synthesia AI Video Generator](https://www.synthesia.io/features/ai-video-generator)

## Best Fit For Noter

The onboarding story is procedural, not just promotional. Users need to
understand a sequence of decisions:

1. GitHub is the source of truth for files.
2. `noter.md` is the simplest way to start taking notes.
3. Cloudflare Pages is the publish step.
4. Convex is the data step.

Because of that, the primary asset should probably be an interactive walkthrough
or guided tutorial, with a short explainer video supporting it.

That makes the best-fit tooling combination:

- `NotebookLM` for script and messaging development.
- `Screen Studio` plus `Descript` for the short overview video.
- `Guidde` or `Supademo` for the step-by-step user path.

## Suggested Onboarding Narrative

Recommended message order:

1. "Bring your GitHub repo. That is where your files live."
2. "Start simple with `noter.md`. Use it like notes, not like a complicated
   CMS."
3. "When you want to publish, connect Cloudflare Pages."
4. "When your app needs real data, connect Convex."
5. "Cloudflare keeps delivery fast" can appear later as a benefit, after the
   basic mental model is already clear.

## Messaging Guardrail

We should be careful about the exact wording around Cloudflare-backed storage
and speed. The safest public message is:

- GitHub is the system of record for the user's files.
- Cloudflare powers fast delivery and publishing.

If we want to say that files are stored on Cloudflare, that claim should be
checked against the actual product implementation before it lands in public
onboarding copy.

## Proposed Next Deliverables

If we continue this track, the next useful assets would be:

1. A 60-90 second script for the overview video.
2. A storyboard for the GitHub -> `noter.md` -> Cloudflare Pages -> Convex flow.
3. A step-by-step interactive walkthrough draft in Guidde or Supademo.
