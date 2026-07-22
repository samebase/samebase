# Vault Dashboard Design Landscape

Date: 2026-07-23. Status: research complete; informs the `/vault/$owner/$repo` redesign exploration
on `claude/vault-ui-design-1033d7`.

Method: five delegated research lanes (three web-research agents, one repo-inventory agent over this
worktree, one agent cataloging `~/dev/samebase/claude_design_exports`), synthesized here. This doc
records the landscape and the recommended exploration approach; it proposes no final design.

## Question

The vault dashboard switched to live, data-model-first rendering (v1721 through v1726) and shows the
data raw. Before sketching anything: (1) what exactly does the route render today, (2) how do
comparable products structure repo/monorepo/deploy dashboards, (3) what did the prior Claude design
exploration already cover, (4) what exploration approach starts from macro structure instead of
details?

## What the route renders today

Chain: `routes/vault-dashboard.tsx` renders `DashboardRoutePage`, which lazy-loads
`components/vault-dashboard/VaultDashboard.tsx` (3684 lines) inside `AuthenticatedAppRoutePage`;
chrome is published via `AppWorkspaceRouteChrome` into `WorkspaceLayoutV2FullPage`.

Left sidebar (`VaultDashboardVaultList`, `VaultDashboard.tsx:1894`): one text row per vault showing
only `repositoryFullName`, plus a highlight for the open vault. No add-vault affordance, no status,
no meta. The backend sorts by `lastEditTime` but nothing displays it.

Main pane, one `VaultDashboardRepositoryCard` for the selected vault:

- Header: repo name, delete control, lifecycle suffixes ("(setting up...)", "(delete failed)", ...).
- Resource rail (`VaultResourceRail.tsx`): GitHub / per-root Cloudflare Worker / per-root Convex
  project rows with admin actions inline on the overview (Configure Workers Builds, Rotate deploy
  keys, Detach, Reconcile team, Change code location), "Add" rows opening the Add Cloudflare / Add
  Convex dialogs (search-param driven), and a "Needs attention" group.
- Default-branch section (`VaultDefaultBranch.tsx:104`): branch link, Edit link into the editor,
  checks popover (v1725), Convex Data/Schema links (v1723), production links grouped per root
  including Cloudflare custom domains (v1724).
- PR rows (`VaultPullRequestList.tsx:286`): draft/ready icon, `PR #N title` link, `head -> base`,
  draft/fork badges, label chips, checks popover with counts, `+adds -dels · files`, "View changes"
  compare link, and per attached worker: Cloudflare build state + logs link, branch preview link,
  Convex preview deployment + Data link. Filters popover/sheet, infinite scroll, 60s polling while
  checks or builds run.

Notable absences: PR author is never fetched (not in the GraphQL query), `updatedAt` is fetched but
never rendered, and the production row shows no commit identity at all (`headCommitOid` only feeds
the checks URL). The habit of visiting `github.com/<org>/<repo>/commits/<default>` to see whether
recent merges passed has no coverage.

States: there are zero skeletons in the route. Three nested layers render `null` until data resolves
(`ApprovalGate`, the route `Suspense`, and `VaultDashboard` itself waiting on `getUserVaults`), so
the pane is blank and then everything pops in at once. Below that first paint, states are rich:
pulse placeholders in rail rows, spinner rows for the PR list, stale banners, elapsed-time stopwatch
in provider dialogs, three optimistic-update toggles, and a scroll-end spacer that resizes via
observers to prevent scroll jumps.

Layout: the pane frame provides container-query support, but vault-dashboard components use none of
it; rows reflow via manual `flex-wrap` with fixed `basis-[22rem]`/`basis-[19rem]` columns. Card
content is capped at `max-w-[1000px]`. Mobile is the workspace pane carousel (separators reworked in
v1722).

Prior art check: `research/2026-07-01-vault-sidebar-dashboard.md` proposed the current
sidebar-plus-selected-vault architecture (implemented); no research or RFC covers a redesign of the
dashboard surface itself.

## Landscape findings

### Mainstream deploy platforms: the repo is not an entity

Vercel, Netlify, and Cloudflare all map one repo with N apps to N disconnected dashboard projects;
none has a repo-level overview screen.

- Vercel: one Project per app directory; the only repo grouping is a project list view grouped by
  git repository
  (<https://vercel.com/changelog/view-projects-grouped-by-git-repository-with-list-view>). Project
  home leads with the current production deployment; settings are a separate sidebar page
  (<https://vercel.com/docs/projects>). The one place multiple apps appear together is the GitHub PR
  bot comment: a table with Name / Status / Preview / Comments / Updated rows per affected project
  (<https://vercel.com/changelog/improved-formatting-for-pull-request-comments>), plus an optional
  consolidated commit status for monorepos (<https://vercel.com/docs/git/vercel-for-github>).
- Netlify: independent projects per app; one status check and bot comment per site per PR, with a
  documented user complaint of 20 to 30 stacked checks cluttering monorepo PRs
  (<https://docs.netlify.com/build/configure-builds/monorepos/>,
  <https://answers.netlify.com/t/deploy-previews-with-a-monorepo-setup-how-to-stop-all-sites-from-generating-previews/118964>).
- Cloudflare: same fragmentation, no grouping UI at all; separate PR comments per Worker/project
  (<https://developers.cloudflare.com/pages/configuration/monorepos/>). The Oct 2025 Worker overview
  redesign leads with metrics, bindings, and recent versions
  (<https://developers.cloudflare.com/changelog/post/2025-10-06-new-worker-overview-page/>).
- Loading conventions: Vercel's Geist ships an entity row with a skeleton variant, with guidance to
  render the skeleton instead of an empty row and swap in place (<https://vercel.com/geist/entity>).

### Multi-service platforms: two aggregation families

- Railway is the one product where a repo's services live on a single screen: the project Canvas,
  with an environment dropdown that swaps the whole canvas between production and per-PR
  environments. A PR clones the entire environment (all services) and emits one GitHub deployment
  status per PR plus a bot comment with per-service links (<https://docs.railway.com/environments>,
  <https://docs.railway.com/guides/preview-deployments-with-pr-environments>).
- Render Blueprints declare multi-service repos; Preview Environments clone the whole blueprint per
  PR; the dashboard groups services as lists under named environments, not a graph
  (<https://render.com/docs/preview-environments>, <https://render.com/docs/projects>).
- Coolify previews are strictly per-application; GitLab's unit is the Environment, with ephemeral
  review apps collapsed into prefix-named folders for legibility at scale
  (<https://docs.gitlab.com/ci/environments/>). Argo CD's home is a flat Application list across all
  repos.
- Heroku Pipelines is the oldest single-board precedent: Development / Review / Staging / Production
  stage columns on one screen, review apps auto-filed into the Review column per PR
  (<https://devcenter.heroku.com/articles/pipelines>).

Family split: spatial canvases (Railway, Argo tree views) buy dependency comprehension but scan
poorly; textual foldered rows (GitLab, Render) scale further on screen space. For a PR-review-
centric workflow, rows win.

### GitHub surfaces: the habit to absorb

DOM-verified live on public repos:

- Repo-home latest-commit bar: author avatar + name, message with inline PR link, a single
  combined-status icon, short SHA, relative time.
- `/commits/<branch>`: per-commit combined-status badge that renders a live "N / M" fraction while
  checks run; clicking opens a dialog listing every check with app, full name, live state text ("In
  progress...", "Successful in 22s"), and a Details link. Counts update in place with no reload; the
  count itself is the progress indicator. No skeletons anywhere.
- PR merge box (2024 redesign): failures pinned to the top and expanded, passing checks collapsed
  under an "X successful checks" rollup line
  (<https://github.com/orgs/community/discussions/143787>).
- The Environments/deployments page is auth-gated even on public repos, and platforms like Vercel
  and Netlify mostly bypass GitHub's native deployments; there is no good reference UI for "what is
  live where". That view is open space.

### Convex dashboard

Team > Project > Deployment (prod, per-member dev, transient previews named after the git branch,
auto-expiring). Per-deployment tabs: Health (default), Data, Functions, Files, Schedules, Logs,
History, Settings (<https://docs.convex.dev/dashboard/deployments/>,
<https://docs.convex.dev/production/hosting/preview-deployments>). Navigation between deployments is
a picker dropdown, one deployment at a time; there is no cross-app or cross-deployment overview.

### Monorepo CI dashboards

Nx Cloud keys every row in a run by `project:target` in one filterable list, which is the
group-aware row model at work (<https://nx.dev/blog/improved-ci-log-with-nx-cloud>). Expo EAS models
monorepo apps as separate projects with separate pages, the fragmentation model.

### Prior Claude design exploration

`~/dev/samebase/claude_design_exports/Samebase Vault Redesign Options.html`: 8 mockups over three
turns, four distinct structures. 1a tabs (Overview / Infrastructure), 1b dense ops board with fixed
field columns, 1c production hero + PR cards + right-rail settings drawer, and turn 3 "one calm
page": collapsed rows, expand for per-root detail, infra silent unless one amber banner.

Mechanisms worth keeping: checks rollup badge per row ("1/2 · building"); deploy info grouped and
labeled by app root; shared Convex backend listed once with "shared by X and Y"; fixed field columns
(CHECKS / BUILD / PREVIEW / CONVEX) at stable x positions with a placeholder glyph for empty cells
(the export used an em dash glyph; any implementation here must use a different placeholder since
repo policy bans that character in UI copy); three-level disclosure (collapsed row, expanded row,
separate infrastructure surface); single sanctioned amber banner; production URL as the biggest
button; two-text-size discipline; sidebar meta only on the selected vault; wrap long hostnames
instead of truncating.

Gaps in the export, confirmed: loading states claimed "decided" but never mocked; only two fixed
breakpoints (desktop card and 390px), nothing for in-between pane widths; monorepo stress-tested
only to 4 roots / 3 workers; settings placement chosen but no settings flow designed.

## Synthesis

1. Repo-as-entity is the open gap. Every mainstream platform fragments a monorepo into disconnected
   per-app projects, and their own correction mechanisms (Vercel's PR comment table, Railway's one
   deployment status per PR environment) prove users want the aggregate view at review time. The
   aggregate lives on GitHub, not in their dashboards. A vault that shows production plus every PR
   across all apps of the repo on one screen has no direct equivalent; the closest precedent is
   Heroku's pipeline board. Showing apps together is the right call, with one condition: aggregate
   by default, per-app detail on demand. Netlify's 20 stacked checks show what happens when per-app
   surfaces multiply without a rollup.
2. Rows are ship events, apps are sub-structure. The operator's questions are event-shaped ("is this
   PR previewable?", "did the merge pass?", "what is live?"), not app-shaped ("how is worker X doing
   across PRs?"). So: rows for production and each PR (later: recent default-branch commits), and
   within a row the per-app breakdown labeled by root, collapsed behind rollup counts. This is
   Vercel's PR table generalized into a page, Nx Cloud's `project:target` rows, and the export's
   turn-3 structure, independently converging on the same shape. App-shaped concerns (domains, keys,
   build config) move off the overview entirely.
3. The production row should absorb the `commits/main` habit: latest default-branch commit identity
   (author, message, relative time) plus the live checks rollup, expandable later to the last N
   commits. GitHub's anatomy for this is proven; today the route shows no commit identity at all.
4. Loading model: GitHub's counts-in-place beats skeleton theater and matches the repo rule "prefer
   silent, smooth UX over chatty loading placeholders". Concretely: paint the frame and durable data
   immediately (vault names, repo name, default branch, attached roots all come from the vaults
   query or are already known), keep every row's geometry stable, let live counts ("3/12") be the
   progress indicator, and use skeleton rows only where a list body would otherwise be empty
   (Geist's entity-with-skeleton). The current blank-until-resolved cascade and pop-in is the single
   worst perceived-quality bug and is a data-orchestration fix as much as a visual one.
5. Data gaps to close for the target design: fetch PR author; render relative `updatedAt`; fetch
   latest default-branch commit message/author/time. All small additions to
   `repositoryPullRequests.ts`.

## Recommended exploration approach

Phase A, macro structure in fixtures (no live data). Extend the existing `/visual-fixture`
playground (`visualFixture.tsx`, `WorkspaceLayoutV2FixtureFrame`) with a new fixture family for the
redesign, new presentational components fed by canonical fixture states; only the workspace layout
v2 pane frame is treated as fixed. This is a design sandbox, not regression evidence; final
acceptance still happens on the real route per the route-first policy in `docs/agent-workflows.md`.

Canonical fixture states to build once and reuse across all candidates:

- single-app vault (one worker, one Convex project)
- the export's monorepo (4 roots, 3 workers, shared Convex backend)
- stress monorepo (10 apps) and PR storm (20 open PRs)
- zero PRs; unconfigured vault; partially attached vault
- checks and builds in flight (for rollup states)
- first-load timeline (t0 durable paint, t1 checks arrive, t2 provider resources arrive)

Macro candidates to compare (three, not more), each rendered at narrow, medium, and wide pane widths
using container queries against the pane frame:

- A "calm rows": turn-3 disclosure model, plus 1b's fixed-column alignment appearing only at wide
  pane widths.
- B "board": 1b's dense fixed-column table throughout.
- C "hero + cards": 1c's production hero with PR cards.

Pick the winner by scanning the stress states, not the pretty ones.

Phase B, loading choreography on the winner: apply the first-load timeline fixture, enforce geometry
stability (a row never changes height when data arrives), then specify the real data orchestration
needed to paint durable content immediately.

Phase C, incremental port to the live route, roughly: move rail admin actions to a settings surface;
restructure PR rows; production row with commit identity; sidebar meta; remove the
blank-until-resolved cascade. Each step is its own PR against the real route with screenshot
coverage.

Open product decisions, one recommendation each:

- Settings placement: a dedicated `/vault/$owner/$repo/settings` surface (sibling of the existing
  `fs`/`db`/`schema` routes). The right sidebar must stay standard navigation per repo rule, which
  rules out 1c's drawer; rare admin actions (rotate keys, detach) do not belong on the
  highest-traffic screen.
- Sidebar: keep one-line rows; the selected vault earns a second meta line (production host); a
  status dot appears only when something needs attention. Healthy infrastructure shows as silence.
- Commits on production row: latest commit only now; last-N expansion later.

## Sources

Key references beyond inline links:

- <https://vercel.com/docs/monorepos>
- <https://docs.railway.com/deployments/monorepo>
- <https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/>
- <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks>
- <https://docs.convex.dev/dashboard/projects>
- <https://docs.expo.dev/build-reference/build-with-monorepos/>
