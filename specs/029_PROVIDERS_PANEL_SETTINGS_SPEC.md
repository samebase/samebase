# Providers Panel Settings Spec

**Summary** Rename the dashboard "Connections" panel to "Providers", make it
collapsible like the existing Developer tools section, and persist the
open/closed state in Convex so it syncs across devices.

**Goals**

- Rename the panel label from "Connections" to "Providers".
- Make the Providers panel collapsible with the same interaction pattern as
  Developer tools.
- Persist the open/closed state per user in Convex (not localStorage).

**Non-Goals**

- Redesign the provider connection flow.
- Change provider connection semantics or backend auth logic.

**Data Model**

- New table: `dashboardSettings`
  - `userId`: `v.id("users")`
  - `providersPanelOpen`: `v.boolean()`
  - Optional: `updatedAt`: `v.number()` (if we want last-change tracking)
- Indexes:
  - `by_user`: `["userId"]`

**Convex API**

- New module: `apps/noter/convex/dashboardSettings.ts`
  - Query `getDashboardSettings`
    - Returns `{ providersPanelOpen: boolean }`
    - If unauthenticated or no row exists, return
      `{ providersPanelOpen: false }`
  - Mutation `setProvidersPanelOpen`
    - Args: `{ isOpen: boolean }`
    - Upsert a row by `userId` to persist the setting
  - Follow Convex style: validators before handlers, `Infer` for types, and
    destructured `v` builders.

**Frontend**

- File: `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - Rename panel heading to "Providers".
  - Wrap the providers list in a `Collapsible`:
    - `CollapsibleTrigger` styled like the Developer tools trigger
    - Chevron rotates on open
  - Load initial open state from `getDashboardSettings`.
  - Persist changes via `setProvidersPanelOpen` mutation.
  - Use local React state to avoid flicker while the mutation is in flight.

**Default Behavior**

- Default closed when no setting exists.
- Same behavior in empty-state view and main dashboard.

**Manual Test Scenarios**

1. New user: Providers panel defaults closed.
2. Toggle open, reload page: state persists.
3. Toggle open on device A, open dashboard on device B: state matches.
4. Empty dashboard still allows expanding Providers and connecting accounts.
