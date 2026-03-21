# Idea: Dashboard-first multi-vault workflow

## Context

Noter already models work around repository-scoped vaults, but the current UX
still pushes the user from the dashboard into the file/editor route for most
real work.

The higher-level product idea is:

- keep `vault` as the unit of ownership, infrastructure, and execution
- make the dashboard the main control plane
- treat the editor/workspace as a drill-down surface, not the default home

This is closer to the Codex mental model:

- choose the repo from a dashboard
- see status and active environments there
- start the agent or workspace from there
- drop into the deeper editor only when needed

## What Noter already has

The current product is structurally much closer to this idea than the UI makes
it feel.

### 1. Vaults are already repo-shaped units

The current schema gives each vault its own:

- GitHub repo identity
- branch metadata
- infrastructure state
- Codespaces
- Daytona sandbox/snapshot state
- domain mappings

### 2. Repo onboarding is already dashboard-centric

The dashboard is already the home route and already owns:

- provider connection state
- create-repository flow
- connect-existing-repository flow
- per-vault cards with branch and infra status

### 3. Chat is already vault-scoped

Chat threads are already persisted one-thread-per-user-per-vault, which is the
exact thread model a dashboard-first agent surface wants.

### 4. The file view is the heavy surface today

The file/editor route still owns the dense workflows:

- file tree navigation
- staging and commit preview
- rebase conflict tooling
- code editing
- agent graph view

That means the missing piece is not the backend model. The missing piece is the
entrypoint and control-plane UX.

## Core product take

The right move is not "replace monorepo with multi-repo" at the app-codebase
level.

The right move is:

- keep the Noter source repo as-is for now
- keep `vault` as the main runtime object
- make the dashboard the place where work starts and often finishes

In other words:

- multi-vault product UX
- dashboard-first interaction model
- workspace/editor as optional depth

## What this does not mean

### 1. It does not require deleting FileView

FileView should remain the detailed editing surface for:

- file-by-file work
- conflict resolution
- richer previews
- code-heavy sessions

### 2. It does not require splitting the Noter source repo

The current repo-level monorepo is a separate concern from the user-facing vault
model. Internal repo splitting should only happen for release/process reasons,
not as part of this product idea.

### 3. It does not yet solve "one app spans many repos"

Today the product has vaults, not a higher-level project entity that groups
several vaults together.

If that becomes important, the likely next layer is:

- add a lightweight project/grouping model above vaults
- do not replace vaults themselves

## Recommended first slice

### 1. Make vault selection open a docked chat/agent panel

The dashboard should be able to open a vault-scoped agent panel directly,
binding to the primary branch by default.

### 2. Promote key card actions

Vault cards should make these actions obvious:

- Chat
- Open workspace
- Open Daytona workspace
- Open Codespace
- Sync / refresh
- Deploy / retry infra
- Branch status

### 3. Add lightweight grouping only if needed

If users begin treating several repos as one product, add:

- tags
- collections
- project/group containers

Do that above vaults, not instead of vaults.

## Why this idea is attractive

- It matches the current data model.
- It matches the current dashboard shape.
- It reduces the cognitive jump between "overview" and "do work".
- It keeps repo status, infra, and agent entry in one place.
- It still preserves the detailed editor route for deeper work.

## Risks and open questions

- How much branch/file specificity should the dashboard own before opening the
  editor?
- Should dashboard chat always pin to the default branch, or require explicit
  branch selection?
- Do we need a higher-level project/group entity immediately, or only after more
  real usage?
- How much agent activity should stay visible on the vault card itself?

## Recommendation

Treat this as a product-UX pivot, not a data-model rewrite and not an internal
repo-layout migration.

The likely best path is:

1. dashboard-first vault control plane
2. vault-scoped chat as a first-class dashboard action
3. editor/workspace as drill-down depth
4. optional grouping above vaults later if cross-repo product modeling proves
   necessary
