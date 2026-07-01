# Vault Sidebar Dashboard

## Prompt

The current `/home` dashboard renders almost every vault and can feel overwhelming. The proposed
direction is to use the existing left sidebar for the user's vault list and let the main pane show
one selected vault plus its branches. Later, the URL can more directly represent panes:

- `/vault` could show the user's vault list.
- `/vault/<org>/<repo>` could keep that list focused in pane 0 and show the selected vault in
  pane 1.
- `/vault/<org>/<repo>/fs/<branch>/<file>` could eventually extend that model with tree and file
  panes.

This pass is intentionally narrower: move the vault list into the left sidebar and render the
selected vault dashboard in the main pane.

## Source Map

- `/home` is `apps/samebase/src/routes/dashboard-home.tsx`, which mounts `DashboardRoutePage`.
- `DashboardRoutePage` lazy-loads `VaultDashboard` inside `AuthenticatedAppRoutePage`.
- `VaultDashboard` uses `api.vault.dashboard.getUserVaults`, then renders `VaultDashboardView`
  inside `AppWorkspaceRouteChrome`.
- `AppWorkspaceRouteChrome` already supports a route-owned `left` pane, so no WorkspaceLayoutV2
  architecture change is needed for this step.
- `VaultDashboardView` already receives a `viewModel.vaults` array and maps that array to
  `VaultDashboardRepositoryCard`, including the current branch list.
- Bare `/vault/<org>/<repo>` previously fell through to the `/vault/$` FileView route, which
  resolved a default branch and then selected an initial README-like file.

## Decision

Keep the existing dashboard query and card/branch components. Add a route-specific selected vault:

- `/home` selects the first vault after the dashboard query resolves.
- `/vault/<org>/<repo>` selects the matching vault and renders the same dashboard card/branch UI for
  that one vault.
- `/vault/<org>/<repo>/fs/...` stays on the existing FileView splat route.
- The left pane lists all vaults as route links to `/vault/<org>/<repo>`.

This is still a data-loading compromise: `getUserVaults` remains broad. The UI boundary now matches
the desired pagination model, so a later backend pass can narrow the main-pane query without
rewriting the layout again.

## Delegation

- Explorer lane 1 mapped `/home`, the dashboard query, and FileView's bare-vault redirect behavior.
- Explorer lane 2 mapped `AppWorkspaceRouteChrome`, WorkspaceLayoutV2 pane APIs, and likely
  dashboard visual/test coverage.

Both lanes recommended reusing the existing dashboard query/card path and registering the left pane
through route chrome.
