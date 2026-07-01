# Vault Sidebar Dashboard

## Prompt

The current `/vault` dashboard renders almost every vault and can feel overwhelming. The proposed
direction is to use the existing left sidebar for the user's vault list and let the main pane show
one selected vault plus its branches. Later, the URL can more directly represent panes:

- `/vault` could show the user's vault list.
- `/vault/<org>/<repo>` could keep that list focused in pane 0 and show the selected vault in
  pane 1.
- `/vault/<org>/<repo>/fs/<branch>/<file>` could eventually extend that model with tree and file
  panes.

This pass is intentionally narrower: make `/vault` the dashboard root, move the vault list into the
left sidebar, and render the selected vault dashboard in the main pane.

## Source Map

- `/vault` is `apps/samebase/src/routes/vault-dashboard-root.tsx`, which mounts
  `DashboardRoutePage`.
- `DashboardRoutePage` lazy-loads `VaultDashboard` inside `AuthenticatedAppRoutePage`.
- `VaultDashboard` uses `api.vault.dashboard.getUserVaults`, then renders `VaultDashboardView`
  inside `AppWorkspaceRouteChrome`.
- `AppWorkspaceRouteChrome` already supports a route-owned `left` pane, so no WorkspaceLayoutV2
  architecture change is needed for this step.
- `VaultDashboardView` already receives a `viewModel.vaults` array and maps that array to
  `VaultDashboardRepositoryCard`, including the current branch list.
- Bare `/vault/<org>/<repo>` previously fell through to the `/vault/$` FileView route, which
  resolved a default branch and then selected an initial README-like file.
- `/home` was the old dashboard route. The final route model deliberately removes it instead of
  redirecting or aliasing it, because the product route contract should have one canonical dashboard
  root.
- The dashboard card hash/scroll model made `/vault#repo` act like selection. That conflicts with
  the route-owned vault model, so this pass removes vault-card fragment ids and dashboard-specific
  hash suggestions.

## Decision

Keep the existing dashboard query and card/branch components. Add a route-specific selected vault:

- `/vault` shows the vault list and an unselected main pane prompt: select a vault from the left
  sidebar or add one from the right sidebar.
- `/vault/<org>/<repo>` selects the matching vault and renders the same dashboard card/branch UI for
  that one vault.
- `/vault/<org>/<repo>/fs/...` stays on the existing FileView splat route.
- The left pane lists all vaults as route links to `/vault/<org>/<repo>`.
- `/home` is removed. There is no redirect, alias, or compatibility fallback.
- Vault dashboard add/delete actions stay on the selected vault route as query params, for example
  `/vault/<org>/<repo>?delete`, not `/vault?delete#repo`.
- `/vault` with no vaults still renders the existing onboarding/logo empty state; the unselected
  prompt is only for loaded users who have at least one vault to pick from.
- After deleting the selected vault, the dashboard replaces the selected-vault URL with `/vault` so
  the user is not stranded on a stale `/vault/<org>/<repo>` route.
- The selected-vault main pane now receives at most one vault, so the old repository-name
  disambiguation map, dashboard card title-link props, and action-target repository re-lookups were
  removed.
- `buildVaultDashboardRoute` matches the other vault route builders by interpolating real GitHub
  owner/repo names directly; branch and path tails remain the encoded segments.

This is still a data-loading compromise: `getUserVaults` remains broad. The UI boundary now matches
the desired pagination model, so a later backend pass can narrow the main-pane query without
rewriting the layout again.

## Delegation

- Explorer lane 1 mapped `/vault`, the dashboard query, and FileView's bare-vault redirect behavior.
- Explorer lane 2 mapped `AppWorkspaceRouteChrome`, WorkspaceLayoutV2 pane APIs, and likely
  dashboard visual/test coverage.

Both lanes recommended reusing the existing dashboard query/card path and registering the left pane
through route chrome.
