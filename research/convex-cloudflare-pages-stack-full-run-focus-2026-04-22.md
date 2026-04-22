# Convex Cloudflare Pages Stack full-run focus

## Goal

Produce one straight onboarding recording that starts from the prepared GitHub,
Convex, and Cloudflare tabs and ends on the deployed Cloudflare Pages URL.

This first full run does not need a perfect script. It should teach us where the
real brittle spots are so later automation work can focus on the right places.

## Current focus areas

- Keep the tab order fixed: GitHub, Convex, Cloudflare.
- Prefer the simple repo name `app` when GitHub allows it.
- Stay on meaningful destinations long enough for a human to register them.
- Keep every created resource private or otherwise non-public by default.
- Treat cleanup as part of the product flow, not just operator hygiene.

## Full-run milestones

1. Set the scene with the 3 tabs.
2. Create the GitHub repo from `noter-md/app`.
3. Create the Convex project.
4. Start the Cloudflare Pages deploy.
5. Create the Convex production deploy key.
6. Return to Cloudflare and finish the deploy.
7. Wait until the Pages build finishes.
8. Open the deployed Pages URL in the browser before ending the recording.
9. Add a todo in the live deployed app so the run proves more than a successful
   build.
10. Clean up every resource created by the run.

## Things to watch closely

- GitHub auth and template UI state can render stale and may need a refresh.
- Convex and Cloudflare sign-in flows may vary slightly even when the broad path
  is the same.
- Cloudflare Pages may require the GitHub account connection to be established
  before the Pages "Get started" flow works.
- Fully uninstalling Cloudflare from GitHub does not necessarily auto-heal the
  next Cloudflare Pages attempt. Returning to the Pages screen can still show
  broken repository-access errors until Cloudflare's own GitHub connection state
  is rebuilt from the dashboard.
- Current working Cloudflare sequence:
  1. Open `https://dash.cloudflare.com/<account>/workers-and-pages/create`.
  2. Use the visible GitHub connect button first so Cloudflare already has the
     GitHub account linked.
  3. Only after that, use the Pages `Get started` path.
  4. During GitHub App install, prefer `Only select repositories` and scope the
     install to the repo created by this run.
- The Convex deploy key and Cloudflare env var value must not leak into the
  final video artifact.
- Cloudflare build time is variable, so the recording needs enough budget to
  wait for the final deployed URL.
- Cleanup must work for partial runs, not only successful end-to-end runs.

## Latest successful run

- Date: 2026-04-22
- GitHub repo: `noter-guest/crispy-octo-goggles` (private)
- Convex project: `crispy-octo-goggles`
- Convex production deployment: `pastel-eel-477`
- Cloudflare Pages URL opened at the end:
  `https://crispy-octo-goggles-7c8.pages.dev/`
- Live-site validation after deploy: added todo `Ship it`

## Latest successful teardown

- Date: 2026-04-22
- Reverse delete order used successfully:
  1. Cloudflare Pages project `crispy-octo-goggles`
  2. Convex project `crispy-octo-goggles`
  3. GitHub repo `noter-guest/crispy-octo-goggles`
- Cloudflare confirmation shape:
  1. open the Pages project
  2. go to `Settings`
  3. scroll to the delete section
  4. type the project slug
  5. confirm delete
- Convex confirmation shape:
  1. open `Project Settings`
  2. use `Delete Project`
  3. check the acknowledgement box
  4. type the exact full deletion phrase
  5. confirm delete
- GitHub confirmation shape:
  1. open repo `Settings`
  2. use `Delete this repository`
  3. continue through GitHub's staged warning buttons
  4. type the full `owner/repo` name
  5. confirm delete
- Result: the full deploy-and-teardown lifecycle now works end to end in the
  live browser.

## TODO after the first full run

- Record the exact points where the flow felt brittle or visually unclear.
- Note where extra dwell time helped and where it felt slow.
- Convert the most stable parts of the flow into reusable recorder helpers only
  after the full path is proven.

## Latest native-run blocker

- Date: 2026-04-22
- The native full-run recorder now reliably gets through:
  1. GitHub template repo creation
  2. Convex project creation
  3. Cloudflare account-link setup
  4. direct navigation to the Pages GitHub provider route
- Current failing state on Cloudflare:
  1. URL stays on
     `https://dash.cloudflare.com/<account>/pages/new/provider/github`
  2. the new repo name is filled into `Search repositories...`
  3. Cloudflare shows `No repositories matching "<repo-name>"`
  4. Cloudflare also shows the red internal-installation error:
     `There is an internal issue with your Cloudflare Pages Git installation...`
- Important conclusion:
  - `Connect GitHub first, then go to Pages` is necessary but not always
    sufficient. Cloudflare can still fail to index the newly created repo even
    after the account-link step succeeds.
