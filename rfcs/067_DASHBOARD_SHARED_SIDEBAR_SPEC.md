# 067 Dashboard Shared Sidebar Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-23
- Depends on:
  - `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/UserMenu.tsx`

## Summary

The dashboard should use the same left sidebar shell as the vault file view.
This first slice only moves the existing account surface into that sidebar:
`Pricing`, `Account details`, and `Sign out`.

No repository-specific sidebar content ships in this change.

## Current State

- The vault file view already renders inside `SidebarProvider` and
  `RepositoryWorkspaceFrame`.
- The dashboard renders as a standalone full-width page and keeps account
  actions in the page header instead of the sidebar.
- The account menu logic already exists in `UserMenu`; it already owns the exact
  actions needed for this work.
- Current sidebar UX is defined by the shared shadcn sidebar primitives: desktop
  off-canvas collapse, mobile sheet behavior, `Cmd/Ctrl+B` toggle, and mobile
  edge-swipe only where `useSwipeToOpenSidebar` is attached.
- The sidebar writes a `sidebar_state` cookie today, but the provider does not
  read that cookie back on mount. This spec keeps that behavior unchanged.

## Proposal

### 1. Shared shell

Use the existing vault sidebar shell for the dashboard as well. The frame is no
longer repository-specific once the dashboard adopts it, so it should be
generalized or renamed to a neutral workspace/app shell component.

The shared shell must let the dashboard:

- render the left sidebar and top bar
- keep the sidebar trigger
- omit vault-only affordances like quick open and repository header text

### 2. Dashboard sidebar content

For this slice, the dashboard sidebar should contain only:

- the same top account row styling/chrome used in the vault sidebar
- the existing `UserMenu` with the current viewer display name
- empty remaining space below it

The dashboard sidebar must not include:

- repository link
- branch name
- file tree
- simple/all-files toggle
- create file/folder actions
- new navigation items or placeholder sections

On the dashboard, the surrounding account row should not be a link. Only the
existing `UserMenu` trigger opens the menu.

### 3. Dashboard page content

The main dashboard body keeps its existing product content:

- create app/agent controls
- provider connection panel
- vault list / empty state

Account actions should no longer be duplicated in the dashboard content header.
The existing top-right `UserMenu` and standalone `Pricing` button should be
removed so the sidebar becomes the canonical account surface, matching the vault
experience.

## Implementation Plan

### Frontend structure

1. Wrap the dashboard route in `SidebarProvider`, mirroring `FileView`.
2. Attach `useSwipeToOpenSidebar` for dashboard mobile behavior so the sidebar
   opens the same way it does in vault view.
3. Generalize `RepositoryWorkspaceFrame` into a shared shell that both dashboard
   and vault can use.
4. Build dashboard-specific `sidebarContent` with only the account section.
5. Keep `UserMenu` behavior unchanged; reuse it as-is.

### Explicit non-goals

- no new account UI
- no new menu items
- no dashboard navigation tree
- no sidebar state persistence redesign
- no Convex schema or API changes

## Validation

- Add or update a dashboard visual fixture that exercises the shared shell with
  the dashboard sidebar present.
- Add or update at least one Playwright screenshot covering the shipped
  dashboard sidebar surface.
- Verify that vault view still renders the same sidebar content and behavior as
  before.

## Acceptance Criteria

- Dashboard renders with the same sidebar shell and toggle mechanics as vault
  view.
- Dashboard sidebar exposes `Pricing`, `Account details`, and `Sign out` through
  the existing `UserMenu`.
- Repository-only sidebar content does not appear on the dashboard.
- Dashboard no longer shows duplicate account actions in its main header/body.
- Vault behavior is unchanged outside of the shared-shell refactor.
