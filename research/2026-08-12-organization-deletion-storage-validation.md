# Organization Deletion Storage Validation

## Document Control

- Date: 2026-08-12
- Status: Local acceptance complete
- Scope: Convex storage attribution for browser uploads and action cache writes
- Product contract: `specs/124_ORGANIZATION_DELETION_SPEC.md`

## Decision

Samebase creates an organization-owned reservation before each browser media upload or action cache
write. Samebase, not the browser, writes the reservation marker into the Convex storage media type.
Organization deletion waits for each live reservation. Expiry cleanup scans bounded storage pages,
deletes unreferenced blobs with the exact marker, and preserves storage that a surviving row uses.
For the first rollout, Samebase also accepts the prior media staging request without a reservation
ID. It verifies the user, membership, and live vault, then records the exact unmarked storage ID in
a durable reservation. A closed organization gate deletes that unreferenced blob immediately.
Production deletion stays unavailable during one 65-minute compatibility window. A bounded global
scan then deletes old storage with no live reservation, staged-file reference, or observed-blob
reference. A stored cursor makes the scan retryable. Deletion becomes available only when the scan
finishes.

## Local Acceptance

The local worktree used a connected fixture vault and a real POST to the Convex HTTP action. The
reservation declared `image/png`. The POST deliberately sent `Content-Type: text/plain`.

The HTTP action returned 200. A direct local `_storage` read showed:

```text
contentType: image/png; samebase-upload=<reservation-id>
size: 158
```

This proves that the server applied the cleanup marker and ignored the client media type for storage
attribution. The validation blob and reservation were removed after the read.

Focused Convex tests also cover these stop points:

- the browser stores a blob, then organization deletion closes the gate before staging
- the browser never attaches the returned blob
- an old client uploads an unmarked blob after the organization gate closes
- an old upload creates an unmarked blob and stops before it calls the staging action
- a GitHub cache action stores a marked blob, then stops before it writes the cache row
- another organization still refers to the same storage ID

In each case, cleanup deletes only unreferenced Samebase-owned storage for the target organization.

The production rollout starts after the new authorization boundaries deploy. Convex documents a
one-hour upload URL lifetime and a two-minute upload timeout. The 65-minute window also exceeds the
maximum action lifetime. After the window, the scan removes an unmarked object even when the old tab
closed and never sent a staging or cleanup request. Each later organization deletion starts without
this rollout delay.
