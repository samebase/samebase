# Convex Cloudflare Pages Stack recording plan

## Goal

Keep one canonical onboarding recording that can be:

- manually reviewed before it ships
- cut into smaller step videos for the README
- rerun regularly to catch third-party UI drift

## Canonical recording strategy

The current preferred strategy is one continuous browser session instead of
separate fresh recordings for each step.

Why:

- it avoids repeating fragile auth and site setup between steps
- it keeps tab state and browser layout stable across the whole flow
- it makes the user journey feel cohesive
- it is easier to rerun end to end for drift detection

The flow should still be defined step by step in markdown, but the video should
be recorded as one straight pass and then cut afterward.

## Tab and identity rules

- Keep the tab order fixed: GitHub, Convex, Cloudflare.
- Treat GitHub as the identity backbone for the initial setup flow.
- Start from a dedicated recording Chrome profile.
- GitHub may already be authenticated in that profile.
- Convex and Cloudflare should start from their intended onboarding entry
  points, not from an already-settled dashboard state.

## Video timing rules

- After a page visibly finishes loading or a new destination is reached, keep it
  on screen for about 1 second before continuing.
- Use a longer 2-second hold on the first Cloudflare dashboard landing before
  switching back to GitHub.
- After landing on the GitHub template repository in the combined flow, trigger
  one explicit page refresh before looking for `Use this template`, because the
  signed-in state can render stale otherwise.
- Every recorder-created GitHub repository must be `Private`. Never rely on the
  page default.
- Do not reuse that full second for small controls like dropdown picks or
  suggestion buttons. Those should settle quickly so the pacing stays brisk.
- Do not switch tabs at the exact moment a page becomes ready.
- Prefer a visible pause with the mouse at rest before major context switches.
- Keep copy-and-paste handoffs inside the same clip or same straight recording
  segment so hidden clipboard state does not cross a cut.
- Every third-party resource created during a recording must have a matching
  scripted cleanup path.
- Final onboarding artifacts must show every user-visible interaction on screen.
  That includes:
  1. tab switches
  2. sidebar navigation
  3. button presses
  4. typing into the address bar
  5. typing into form fields
- Do not use hidden direct URL changes, silent JavaScript form fills, or other
  invisible state jumps in the final tutorial recording. Those are acceptable
  only for research/debug runs, not for the ship-ready artifact.

## Step checkpoints

The markdown step structure is still useful, but it should be used as a
checkpoint system for one canonical recording.

Current intended checkpoints:

1. Open the 3 tabs and set the scene.
2. Create the GitHub repo.
3. Create the Convex project.
4. Start the Cloudflare deploy.
5. Create the Convex deploy key and finish the deploy.
6. Open the deployed Pages URL and perform one live app action such as adding a
   todo.
7. Delete the created Cloudflare app, Convex project, and GitHub repo.

Each checkpoint should have:

- a clear success condition
- a natural settled frame that can become a cut point
- enough dwell time for manual review

## Automation expectation

The long-term goal is not blind publishing.

The automation should:

- rerun the canonical recording flow
- produce the updated master MP4
- emit visual artifacts or checkpoints for review
- make it obvious which checkpoint changed or broke
- clean up the created external resources at the end so repeated runs do not
  accumulate public repos, stray projects, or stray deployed apps

The human operator should still manually watch the results before shipping them
as onboarding content.

## Near-term implementation guidance

- Continue building the onboarding recorder as one straight flow.
- Keep the step definitions in markdown so they are easy to inspect and edit.
- After the full flow works, add cut markers or known timestamps so the master
  recording can be split into per-step clips.
- Prefer investing in reliable checkpointing and review outputs before trying to
  make every step independently replayable.
- Treat Cloudflare GitHub linking as a prerequisite to the Pages import flow
  when the UI requires it. Current working operator sequence:
  1. land on the Workers & Pages create screen
  2. connect GitHub first
  3. then enter the Pages `Get started` flow once the account link exists
  4. install the GitHub App for `Only select repositories`
  5. scope it to the repo created in the current run
- For the final Cloudflare tutorial path, do not jump straight to the Pages
  provider URL. Show the real UI path visibly:
  1. open the Cloudflare tab
  2. navigate through the visible Workers & Pages UI
  3. click the visible Pages `Get started` control
  4. type the repo name into the visible search field
- Do not assume uninstalling the GitHub app or OAuth grant will make the next
  Cloudflare attempt self-heal. Cloudflare can keep a broken repo-access state
  until the dashboard-side GitHub connection is re-established.
- Even after the account-link step is healthy, Cloudflare can still fail later
  on the Pages provider screen with both:
  1. `No repositories matching "<repo-name>"`
  2. the red `internal issue with your Cloudflare Pages Git installation`
     banner
- Treat that as a real provider-side blocker, not just a search-field timing
  issue. The automation should surface it explicitly instead of silently
  waiting forever for build settings fields that will never appear.
- End the canonical run on the real deployed app, not the provider success
  screen. The preferred proof step is to add a todo in the live site.
- For services where we already expose an app-owned delete-all path in Noter,
  prefer reusing that deletion flow through the product API.
- For third-party services, keep a visible browser cleanup flow so the tutorial
  also teaches deletion and doubles as an end-to-end teardown test.
- Current proven teardown order is reverse dependency order:
  1. Cloudflare Pages project
  2. Convex project
  3. GitHub repository
- Current proven delete confirmations:
  1. Cloudflare: project `Settings` -> delete section -> type the project slug
     -> confirm delete
  2. Convex: `Project Settings` -> `Delete Project` -> check acknowledgement ->
     type the exact full deletion phrase -> confirm delete
  3. GitHub: repo `Settings` -> `Delete this repository` ->
     `I want to delete this repository` ->
     `I have read and understand these effects` -> type the full `owner/repo`
     name -> confirm delete
- Apply cleanup incrementally. If a partial run only created a GitHub repo,
  delete just the repo. If it also created Convex, delete both. If it reached
  Cloudflare, delete all three.
