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
- a GitHub cache action stores a marked blob, then stops before it writes the cache row
- another organization still refers to the same storage ID

In each case, cleanup deletes only unreferenced Samebase-owned storage for the target organization.

The initial rollout also waits 65 minutes after the deletion request before local data cleanup.
Polar billing cleanup starts after the active provider-write fences drain and does not wait for this
storage fence. Convex documents a one-hour upload URL lifetime and a two-minute upload timeout. The
wait covers a URL or action that the deployment before these reservations authorized but could not
mark.
