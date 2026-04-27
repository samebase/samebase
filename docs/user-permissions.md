# User Permissions

## Permission Keys

```ts
type UserPermission =
  | "dashboard.monitoring.view"
  | "fileView.access"
  | "developerTools.view"
  | "machines.access";
```

## Granting Access

Permissions are stored on the Convex Auth `users` row:

```ts
permissionGrants: ["dashboard.monitoring.view", "fileView.access"];
```

Admins receive every permission automatically. Non-admin users must also have
base app access through `users.isApproved === true`; otherwise explicit grants
stay inactive.

## What Each Permission Unlocks

- `dashboard.monitoring.view`: dashboard project/vault list, branches, PR
  metadata, Cloudflare preview hydration, and dashboard refreshes.
- `fileView.access`: `/vault/$` routes and FileView file/staging/commit/PR
  operations.
- `developerTools.view`: Dashboard and FileView Developer tools.
- `machines.access`: machine routes, machine registration approval, connected
  machine list, and browser control tokens.

The add/create app path remains available to approved users without these
advanced permissions and only uses lightweight connected-repository names to
hide already-connected repositories.
